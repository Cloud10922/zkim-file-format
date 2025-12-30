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
   */
  public static clearInstances(): void {
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
        while (this.initializing && !this.initialized) {
          await new Promise((resolve) => setTimeout(resolve, 10));
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

