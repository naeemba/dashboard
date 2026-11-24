import { existsSync } from 'node:fs';
import { failureText } from '../../shared/errors/failure';
import { adoptSshAgent } from './ssh-agent';

// What process.env holds before main builds anything from it: the user's .env, then the SSH agent
// (ssh-agent.ts). Out of main.ts, which is at its 600-line ceiling.
//
// The app opens without the .env. What is in this file is a shell command and a list of project
// folders, so a launch that cannot read it opens on the shipped defaults with nothing you set applied —
// worth a line on the status bar, not worth the window.
//
// It has to be a try, not a check: existsSync says yes for a directory and for a file whose permissions
// have gone, and loadEnvFile throws on both. Before this, a .env that was a folder meant double-clicking
// Dashboard and having nothing happen at all — no window, no message, the icon bouncing once.
export function readLaunchEnvironment(environmentFile: string, hold: (message: string) => void): void {
  if (existsSync(environmentFile)) {
    try {
      process.loadEnvFile(environmentFile);
    } catch (error: unknown) {
      hold(`${environmentFile} was not read: ${failureText(error)}`);
    }
  }
  adoptSshAgent();
}
