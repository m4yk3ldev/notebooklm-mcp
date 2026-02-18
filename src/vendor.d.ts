declare module "chrome-remote-interface" {
  function CDP(options?: { port?: number }): Promise<any>;
  export = CDP;
}
