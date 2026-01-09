/**
 * Singleton Pattern Base Classes for @zkim-platform/file-format
 * Lightweight singleton implementation without platform dependencies
 */

import { ServiceError } from "../types/errors";

import { ErrorUtils } from "./error-handling";

/**
 * Base Singleton Class
 * Use this for simple singletons that don't require initialization
 */
export abstract class SingletonBase {
  protected static instances = new Map<new () => unknown, unknown>();

  /**
   * Protected constructor to prevent direct instantiation
   */
  protected constructor() {
    if (SingletonBase.instances.has(this.constructor as new () => unknown)) {
      throw new ServiceError(
        `${this.constructor.name} is a singleton. Use getInstance() instead.`,
        {
          code: "SINGLETON_INSTANTIATION_ERROR",
          details: {
            className: this.constructor.name,
          },
        }
      );
    }
  }

  /**
   * Get or create the singleton instance
   */
  public static getInstance<T>(this: new () => T): T {
    if (!SingletonBase.instances.has(this)) {
      SingletonBase.instances.set(this, new this());
    }
    return SingletonBase.instances.get(this) as T;
  }

  /**
   * Clear all singleton instances (useful for testing)
   * For ServiceBase instances, cleanup() is called before clearing
   */
  public static async clearInstances(): Promise<void> {
    // Cleanup all ServiceBase instances before clearing
    // CRITICAL: This must complete cleanup even if some services fail
    const cleanupPromises: Promise<void>[] = [];
    const instanceNames: string[] = [];
    
    for (const instance of SingletonBase.instances.values()) {
      // Check if instance is a ServiceBase (has cleanup method)
      if (instance && typeof instance === "object" && "cleanup" in instance && typeof (instance as { cleanup: unknown }).cleanup === "function") {
        const serviceInstance = instance as { cleanup: () => Promise<void> };
        const instanceName = instance.constructor?.name || "unknown";
        instanceNames.push(instanceName);
        
        cleanupPromises.push(
          serviceInstance.cleanup().catch((error) => {
            // Silently catch errors - we want to cleanup all instances
            // Errors are logged by ErrorUtils in cleanup methods
            // This ensures timers are cleared even if cleanup partially fails
            void error; // Acknowledge error but don't throw
          })
        );
      }
    }
    
    // Wait for all cleanup to complete - use allSettled to ensure all run
    // This ensures all cleanup attempts complete even if some fail
    await Promise.allSettled(cleanupPromises);
    
    // Now clear all instances - this must happen even if cleanup failed
    // Clearing instances ensures no orphaned references remain
    SingletonBase.instances.clear();
  }

  /**
   * Check if an instance exists
   */
  public static hasInstance<T>(this: new () => T): boolean {
    return SingletonBase.instances.has(this);
  }
}

/**
 * Service Base Class
 * Use this for services that require initialization and cleanup
 */
export abstract class ServiceBase extends SingletonBase {
  protected initialized = false;
  protected initializing = false;

  /**
   * Public constructor for ServiceBase extensions
   * Required because getServiceInstance() calls new this() internally
   */
  public constructor() {
    super();
  }

  /**
   * Initialize the service
   * Must be async and return Promise<void>
   */
  public abstract initialize(): Promise<void>;

  /**
   * Cleanup the service
   * Must be async and return Promise<void>
   */
  public abstract cleanup(): Promise<void>;

  /**
   * Check if the service is ready
   */
  public isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get service status
   */
  public getStatus(): { initialized: boolean; [key: string]: unknown } {
    return {
      initialized: this.initialized,
      initializing: this.initializing,
      serviceName: this.constructor.name,
    };
  }

  /**
   * Ensure service is initialized before use
   */
  protected async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      if (this.initializing) {
        // Wait for initialization to complete with polling
        // This ensures we wait for the actual initialization, not just a timeout
        // In test environment, use Promise.resolve to avoid real timers
        // In production, use setTimeout for actual delay
        while (this.initializing && !this.initialized) {
          // In test environment, use microtask queue instead of setTimeout
          // This works with fake timers and doesn't create real timers
          // Simple inline check - no dynamic imports that could fail
          if (
            (typeof process !== "undefined" && process.env.NODE_ENV === "test") ||
            typeof jest !== "undefined"
          ) {
            await Promise.resolve();
          } else {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
        return;
      }
      await this.initialize();
    }
  }

  /**
   * Get or create and initialize the singleton instance
   * This is the ONLY way to get ServiceBase instances
   */
  public static async getServiceInstance<T extends ServiceBase>(
    this: new () => T
  ): Promise<T> {
    // Create instance if it doesn't exist
    if (!SingletonBase.instances.has(this)) {
      SingletonBase.instances.set(this, new this());
    }
    const instance = SingletonBase.instances.get(this) as T;

    // Initialize if not already initialized and not currently initializing
    if (!instance.initialized && !instance.initializing) {
      instance.initializing = true;
      const context = ErrorUtils.createContext(
        "ServiceBase",
        "getServiceInstance",
        {
          serviceName: instance.constructor.name,
          sessionId: "init",
          severity: "high",
        }
      );

      try {
        const result = await ErrorUtils.withErrorHandling(async () => {
          await instance.initialize();
          instance.initialized = true;
        }, context);

        if (!result.success) {
          throw new ServiceError(
            `Failed to initialize service instance: ${result.error}`,
            {
              code: "SERVICE_INSTANCE_INITIALIZATION_ERROR",
              details: {
                serviceName: instance.constructor.name,
                error: result.error,
              },
            }
          );
        }
      } finally {
        instance.initializing = false;
      }
    }
    return instance;
  }
}

