#!/usr/bin/env python3
"""Create a systemd autostart service for a given script path."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import sys


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def default_python_bin(root: Path) -> str:
    candidates = [
        root / "venv" / "bin" / "python",
        root / ".venv" / "bin" / "python",
        Path(sys.executable),
    ]
    for candidate in candidates:
        candidate_path = Path(candidate)
        if candidate_path.exists():
            return str(candidate_path.expanduser())
    return sys.executable


def parse_args():
    root = repo_root()
    parser = argparse.ArgumentParser(
        description=(
            "Create and enable a systemd autostart service for any script path."
        )
    )
    parser.add_argument(
        "script_path",
        help="Path to the script that should run automatically on boot",
    )
    parser.add_argument(
        "--service-name",
        default=None,
        help="Optional service name without .service; defaults to the script file name",
    )
    parser.add_argument(
        "--description",
        default=None,
        help="Optional systemd Description; defaults to 'Autostart for <script name>'",
    )
    parser.add_argument(
        "--user",
        default=None,
        help="User that should run the service; defaults to SUDO_USER or current user",
    )
    parser.add_argument(
        "--working-directory",
        default=None,
        help="Working directory for the service; defaults to the script's directory",
    )
    parser.add_argument(
        "--python-bin",
        default=default_python_bin(root),
        help="Python executable to use for .py scripts",
    )
    parser.add_argument(
        "--restart",
        default="always",
        choices=["no", "always", "on-failure"],
        help="systemd Restart policy",
    )
    parser.add_argument(
        "--restart-sec",
        type=float,
        default=5.0,
        help="Delay before restart in seconds",
    )
    parser.add_argument(
        "--wanted-by",
        default="multi-user.target",
        help="systemd target for enablement",
    )
    parser.add_argument(
        "--env",
        action="append",
        default=["PYTHONUNBUFFERED=1"],
        help="Extra environment entry in KEY=VALUE form; can be passed multiple times",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the generated service file without installing it",
    )
    return parser.parse_args()


def fail(message: str) -> None:
    raise SystemExit(message)


def resolve_run_user(user_arg: str | None) -> str:
    if user_arg:
        return user_arg
    return os.environ.get("SUDO_USER") or os.environ.get("USER") or pwd.getpwuid(os.getuid()).pw_name


def sanitize_service_name(name: str) -> str:
    cleaned = []
    for ch in name:
        if ch.isalnum() or ch in "-_":
            cleaned.append(ch)
        else:
            cleaned.append("-")
    value = "".join(cleaned).strip("-_")
    return value or "custom-autostart"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def infer_execstart(script_path: Path, python_bin: str) -> str:
    suffix = script_path.suffix.lower()
    if suffix == ".py":
        python_path = str(Path(python_bin).expanduser())
        return f"{shell_quote(python_path)} {shell_quote(str(script_path))}"
    if suffix == ".sh":
        bash_path = shutil.which("bash") or "/bin/bash"
        return f"{shell_quote(bash_path)} {shell_quote(str(script_path))}"
    if os.access(script_path, os.X_OK):
        return shell_quote(str(script_path))
    fail(
        f"Cannot infer how to run {script_path}. Make it executable or use a .py/.sh script."
    )


def build_service_text(
    service_name: str,
    description: str,
    user: str,
    working_directory: str,
    execstart: str,
    restart: str,
    restart_sec: float,
    wanted_by: str,
    env_entries: list[str],
) -> str:
    env_lines = []
    for entry in env_entries:
        if "=" not in entry:
            fail(f"Invalid --env entry {entry!r}; expected KEY=VALUE")
        env_lines.append(f"Environment={entry}")
    restart_line = "Restart=no" if restart == "no" else f"Restart={restart}"
    lines = [
        "[Unit]",
        f"Description={description}",
        "After=network-online.target",
        "Wants=network-online.target",
        "",
        "[Service]",
        "Type=simple",
        f"User={user}",
        f"WorkingDirectory={working_directory}",
        *env_lines,
        f"ExecStart={execstart}",
        restart_line,
        f"RestartSec={restart_sec:g}",
        "",
        "[Install]",
        f"WantedBy={wanted_by}",
        "",
    ]
    return "\n".join(lines)


def main():
    args = parse_args()
    script_path = Path(args.script_path).expanduser().resolve()
    if not script_path.exists():
        fail(f"Script not found: {script_path}")
    if not script_path.is_file():
        fail(f"Not a file: {script_path}")

    service_stem = sanitize_service_name(args.service_name or script_path.stem)
    service_name = f"{service_stem}.service"
    description = args.description or f"Autostart for {script_path.name}"
    run_user = resolve_run_user(args.user)
    working_directory = str(
        Path(args.working_directory).expanduser().resolve()
        if args.working_directory
        else script_path.parent
    )
    execstart = infer_execstart(script_path, args.python_bin)
    service_text = build_service_text(
        service_name=service_name,
        description=description,
        user=run_user,
        working_directory=working_directory,
        execstart=execstart,
        restart=args.restart,
        restart_sec=args.restart_sec,
        wanted_by=args.wanted_by,
        env_entries=args.env,
    )

    service_path = Path("/etc/systemd/system") / service_name
    if args.dry_run:
        print(f"# Service file: {service_path}")
        print(f"# Enable with: sudo systemctl enable {service_name}")
        print(f"# Start with: sudo systemctl restart {service_name}")
        print()
        print(service_text, end="")
        return

    if os.geteuid() != 0:
        fail(
            "Run this script with sudo so it can write to /etc/systemd/system and enable the service."
        )

    service_path.write_text(service_text, encoding="utf-8")
    subprocess.run(["systemctl", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "enable", service_name], check=True)
    subprocess.run(["systemctl", "restart", service_name], check=True)

    print(f"Installed {service_path}")
    print(f"Enabled and restarted {service_name}")
    print(f"Check status with: sudo systemctl status {service_name}")
    print(f"Logs: sudo journalctl -u {service_name} -f")


if __name__ == "__main__":
    main()
