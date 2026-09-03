const platformDefault: Record<string, string> = {
  darwin: '/bin/zsh',
  win32: 'powershell.exe',
};

export function pickShell(
  environment: Record<string, string | undefined>,
  platform: string,
): string {
  return (
    environment.SHELL_COMMAND ||
    environment.SHELL ||
    platformDefault[platform] ||
    '/bin/bash'
  );
}
