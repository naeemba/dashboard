import { connect } from 'node:net';

// Whether anything listens on the socket, without saying anything to it: the nvim server coming up,
// and the `dashboard` command finding a running app.
export function canConnect(socket: string): Promise<boolean> {
  return new Promise((resolve) => {
    const connection = connect(socket)
      .on('connect', () => {
        connection.end();
        resolve(true);
      })
      .on('error', () => resolve(false));
  });
}
