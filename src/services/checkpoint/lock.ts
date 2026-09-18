/**
 * Asynchronous per-path mutex manager.
 * Ensures serial execution for mutations targeting the same file while allowing
 * mutations to distinct files to execute concurrently.
 * Also supports multi-path locking in deterministic lexicographical order to prevent deadlocks.
 */
export class MutationLockManager {
  private locks = new Map<string, Promise<void>>();

  /**
   * Acquires an exclusive lock for a single path.
   * Returns a release function to be called in a finally block.
   */
  public async acquire(canonicalPath: string): Promise<() => void> {
    let releaseCurrent!: () => void;
    const currentLock = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });

    const previousLock = this.locks.get(canonicalPath) ?? Promise.resolve();
    // Update map immediately so subsequent callers chain behind this currentLock
    this.locks.set(
      canonicalPath,
      previousLock.then(
        () => currentLock,
        () => currentLock,
      ),
    );

    await previousLock;

    let released = false;
    return () => {
      if (!released) {
        released = true;
        releaseCurrent();
        if (this.locks.get(canonicalPath) === currentLock) {
          this.locks.delete(canonicalPath);
        }
      }
    };
  }

  /**
   * Acquires locks for multiple paths in deterministic lexicographical order.
   * Returns a single release function that unlocks all acquired paths.
   */
  public async acquireMany(canonicalPaths: string[]): Promise<() => void> {
    const uniqueSorted = Array.from(new Set(canonicalPaths)).sort();
    const releaseFns: (() => void)[] = [];

    for (const p of uniqueSorted) {
      const release = await this.acquire(p);
      releaseFns.push(release);
    }

    let released = false;
    return () => {
      if (!released) {
        released = true;
        // Release in reverse order of acquisition
        for (let i = releaseFns.length - 1; i >= 0; i--) {
          releaseFns[i]();
        }
      }
    };
  }
}

export const globalMutationLockManager = new MutationLockManager();
