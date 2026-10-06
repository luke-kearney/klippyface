using Klippyface.Server.Services.Moonraker;

namespace Klippyface.Server.Tests.Moonraker;

public class DisplayCommandTests
{
    [Fact]
    public void Parses_a_respond_line()
    {
        var command = DisplayCommand.TryParse("echo: display:node=desk group=celebration set=party loop=3");

        Assert.Equal(new DisplayCommand("desk", "celebration", "party", 3), command);
    }

    [Fact]
    public void Node_set_and_loop_are_optional()
    {
        var command = DisplayCommand.TryParse("// display:GROUP=idle");

        Assert.Equal(new DisplayCommand(null, "idle", null, null), command);
    }

    [Theory]
    [InlineData("echo: hello")]
    [InlineData("echo: display:set=party")]
    [InlineData("echo: display:group=")]
    public void Lines_without_a_group_are_ignored(string line)
    {
        Assert.Null(DisplayCommand.TryParse(line));
    }
}
