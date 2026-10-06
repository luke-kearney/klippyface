using System.Text.Json.Nodes;

namespace FakeMoonraker.Simulation;

/// <summary>
/// Moves the printer along: heaters ease towards their targets, a print job
/// heats up and then advances. All results are written into the model.
/// </summary>
public sealed class PrinterSimulation(PrinterModel model)
{
    public const double Ambient = 22.0;
    public const double PrintTemp = 215.0;
    public const double StandbyTemp = 175.0;
    public const double BedTemp = 60.0;

    private const double ExtruderTau = 4.0;   // seconds; reaches 215 °C from cold in ~18 s
    private const double BedTau = 12.0;       // ~35 s to 60 °C
    private const double MinExtrudeTemp = 170.0;
    private const double ReadyBand = 2.0;     // within this of target counts as "at temperature"
    private const int Layers = 100;

    private readonly Lock _lock = new();
    private PrintJob? _job;

    public PrinterModel Model => model;

    /// <summary>Random wobble on heater readings, in °C. Tests set it to 0.</summary>
    public double Noise { get; set; } = 0.08;

    /// <summary>Off while replaying a capture, so only recorded values change.</summary>
    public bool Physics { get; set; } = true;

    public bool IsPrinting
    {
        get { lock (_lock) return _job is not null; }
    }

    public void Advance(TimeSpan elapsed)
    {
        if (!Physics) return;

        var dt = elapsed.TotalSeconds;
        lock (_lock)
        {
            foreach (var name in model.Profile.ExtruderNames)
            {
                var temp = AdvanceHeater(name, ExtruderTau, dt);
                model.Set(name, "can_extrude", temp >= MinExtrudeTemp);
            }
            AdvanceHeater("heater_bed", BedTau, dt);

            model.Set("toolhead", "print_time", Round(model.GetDouble("toolhead", "print_time") + dt, 3));
            model.Set("toolhead", "estimated_print_time",
                Round(model.GetDouble("toolhead", "estimated_print_time") + dt, 3));

            if (_job is not null)
                AdvanceJob(_job, dt);
        }
    }

    private double AdvanceHeater(string name, double tau, double dt)
    {
        var temp = model.GetDouble(name, "temperature");
        var target = model.GetDouble(name, "target");
        var goal = target > 0 ? target : Ambient;

        temp += (goal - temp) * (1 - Math.Exp(-dt / tau));
        temp += (Random.Shared.NextDouble() * 2 - 1) * Noise;

        var power = target > 0 ? Math.Clamp(0.25 + (target - temp) / 20, 0, 1) : 0;

        model.Set(name, "temperature", Round(temp, 2));
        model.Set(name, "power", Round(power, 3));
        return temp;
    }

    private void AdvanceJob(PrintJob job, double dt)
    {
        job.Total += dt;
        model.Set("print_stats", "total_duration", Round(job.Total, 3));

        switch (job.Phase)
        {
            case PrintPhase.Heating:
                if (AtTemperature(ActiveExtruder) && AtTemperature("heater_bed"))
                    job.Phase = PrintPhase.Printing;
                break;

            case PrintPhase.Printing:
                job.Printed = Math.Min(job.Printed + dt, job.Duration);
                WriteProgress(job);
                if (job.Printed >= job.Duration)
                    Finish("complete");
                break;
        }
    }

    private void WriteProgress(PrintJob job)
    {
        var progress = job.Printed / job.Duration;
        var layer = Math.Max(1, (int)Math.Ceiling(progress * Layers));

        model.Set("print_stats", "print_duration", Round(job.Printed, 3));
        model.Set("print_stats", "filament_used", Round(job.Printed * 20, 2));   // ~20 mm/s
        model.Set("print_stats", "info", new JsonObject { ["total_layer"] = Layers, ["current_layer"] = layer });
        model.Set("virtual_sdcard", "progress", Round(progress, 4));
        model.Set("virtual_sdcard", "file_position", (long)(progress * job.FileSize));
        model.Set("display_status", "progress", Round(progress, 4));
        model.Set("toolhead", "position", new JsonArray(
            Round(125 + 50 * Math.Sin(job.Printed), 3),
            Round(125 + 50 * Math.Cos(job.Printed), 3),
            Round(layer * 0.2, 3),
            Round(job.Printed * 20, 2)));
    }

    private bool AtTemperature(string heater) =>
        Math.Abs(model.GetDouble(heater, "temperature") - model.GetDouble(heater, "target")) <= ReadyBand;

    private string ActiveExtruder => model.GetString("toolhead", "extruder") ?? "extruder";

    // ---------------------------------------------------------------
    // Actions, used by the control endpoints and scenarios
    // ---------------------------------------------------------------

    /// <summary>Start a print. Returns false if one is already running.</summary>
    public bool StartPrint(string filename = "benchy.gcode", TimeSpan? duration = null)
    {
        lock (_lock)
        {
            if (_job is not null) return false;

            _job = new PrintJob((duration ?? TimeSpan.FromMinutes(2)).TotalSeconds);

            model.Merge(new JsonObject
            {
                ["print_stats"] = new JsonObject
                {
                    ["filename"] = filename,
                    ["state"] = "printing",
                    ["message"] = "",
                    ["total_duration"] = 0.0,
                    ["print_duration"] = 0.0,
                    ["filament_used"] = 0.0,
                    ["info"] = new JsonObject { ["total_layer"] = Layers, ["current_layer"] = 0 },
                },
                ["virtual_sdcard"] = new JsonObject
                {
                    ["file_path"] = $"/home/pi/printer_data/gcodes/{filename}",
                    ["progress"] = 0.0,
                    ["is_active"] = true,
                    ["file_position"] = 0,
                    ["file_size"] = _job.FileSize,
                },
                ["display_status"] = new JsonObject { ["progress"] = 0.0 },
                ["toolhead"] = new JsonObject { ["homed_axes"] = "xyz" },
            });
            model.Set("heater_bed", "target", BedTemp);
            model.Set(ActiveExtruder, "target", PrintTemp);
            return true;
        }
    }

    public bool Pause() => SetPhase(PrintPhase.Paused, "paused", from: null);

    public bool Resume() => SetPhase(PrintPhase.Printing, "printing", from: PrintPhase.Paused);

    private bool SetPhase(PrintPhase phase, string state, PrintPhase? from)
    {
        lock (_lock)
        {
            if (_job is null || _job.Phase == phase || (from is not null && _job.Phase != from)) return false;
            _job.Phase = phase;
            model.Set("print_stats", "state", state);
            model.Set("virtual_sdcard", "is_active", phase != PrintPhase.Paused);
            return true;
        }
    }

    public bool Cancel()
    {
        lock (_lock) return Finish("cancelled");
    }

    /// <summary>Jump to the end of the current print.</summary>
    public bool Complete()
    {
        lock (_lock)
        {
            if (_job is null) return false;
            _job.Printed = _job.Duration;
            WriteProgress(_job);
            return Finish("complete");
        }
    }

    private bool Finish(string state)
    {
        if (_job is null) return false;
        _job = null;

        model.Set("print_stats", "state", state);
        model.Set("virtual_sdcard", "is_active", false);
        // End G-code turns the heaters off
        model.Set("heater_bed", "target", 0.0);
        foreach (var name in model.Profile.ExtruderNames)
            model.Set(name, "target", 0.0);
        return true;
    }

    /// <summary>
    /// Switch the active tool (T0, T1, ...). During a print the old tool drops to
    /// standby temperature and the new one heats to print temperature.
    /// </summary>
    public bool SelectTool(int index)
    {
        lock (_lock)
        {
            if (index < 0 || index >= model.Profile.Extruders) return false;

            var previous = ActiveExtruder;
            var next = PrinterProfile.ExtruderName(index);
            model.Set("toolhead", "extruder", next);

            if (_job is not null && previous != next)
            {
                model.Set(previous, "target", StandbyTemp);
                model.Set(next, "target", PrintTemp);
            }
            return true;
        }
    }

    /// <summary>What a Klipper restart does: every object back to its start-up state.</summary>
    public void Reset()
    {
        lock (_lock)
        {
            _job = null;
            model.Reset();
        }
    }

    private static double Round(double value, int digits) => Math.Round(value, digits);

    private enum PrintPhase { Heating, Printing, Paused }

    private sealed class PrintJob(double duration)
    {
        public double Duration { get; } = duration;
        public long FileSize { get; } = 1_234_567;
        public PrintPhase Phase { get; set; } = PrintPhase.Heating;
        public double Printed { get; set; }
        public double Total { get; set; }
    }
}
