// Stand-ins for the Workers runtime's base classes, so the hub's own code runs on Node in a test
// (tests/hub.test.ts). The runtime gives these classes `ctx` and `env`; so do these.
export class DurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}
export class WorkerEntrypoint {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}
