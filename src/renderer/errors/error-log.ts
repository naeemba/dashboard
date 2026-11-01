// Whether a status-bar message goes in the log. A failure on a timer says the same sentence every few
// seconds; logging each repaint would fill the file with one line. A clear is not an error at all.
export function shouldLogError(message: string, onScreen: string): boolean {
  return message !== '' && message !== onScreen;
}
