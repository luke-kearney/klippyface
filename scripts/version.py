# PlatformIO pre-build script: generates KlippyfaceVersion.h from VERSION.
#
# Builds from the matching v<VERSION> tag get the plain version ("0.2.0").
# Any other build gets the git commit appended ("0.2.0+g1a2b3c4", plus
# ".dirty" for uncommitted changes) so test builds can be told apart.
#
# The header lives in the build dir and is only rewritten when its content
# changes, so a new commit recompiles only the files that include it.

import subprocess
from pathlib import Path

Import("env")

project_dir = Path(env["PROJECT_DIR"])


def git(*args):
    try:
        return subprocess.check_output(
            ["git", *args], cwd=project_dir, stderr=subprocess.DEVNULL, text=True
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return ""


version = (project_dir / "VERSION").read_text().strip()

if git("describe", "--tags", "--exact-match") != f"v{version}":
    sha = git("rev-parse", "--short", "HEAD")
    if sha:
        version += f"+g{sha}"
        if git("status", "--porcelain", "--untracked-files=no"):
            version += ".dirty"

out_dir = Path(env.subst("$BUILD_DIR")) / "generated"
out_dir.mkdir(parents=True, exist_ok=True)
header = out_dir / "KlippyfaceVersion.h"

content = (
    "#ifndef KLIPPYFACE_VERSION_H\n"
    "#define KLIPPYFACE_VERSION_H\n"
    "\n"
    f'#define KLIPPYFACE_VERSION "{version}"\n'
    "\n"
    "#endif\n"
)

if not header.exists() or header.read_text() != content:
    header.write_text(content)

env.Append(CPPPATH=[str(out_dir)])
print(f"Klippyface version: {version}")
