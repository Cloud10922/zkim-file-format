/**
 * Singleton Base Branch Coverage Tests
 * Targets specific branches to improve branch coverage metrics
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { SingletonBase, ServiceBase } from "../../src/utils/singleton-base";
import { ServiceError } from "../../src/types/errors";
import { ErrorUtils } from "../../src/utils/error-handling";

// Test classes for SingletonBase
class TestSingleton extends SingletonBase {
  public value = "test";
}

class TestService extends ServiceBase {
  public async initialize(): Promise<void> {
    // Simple initialization
  }

  public async cleanup(): Promise<void> {
    // Simple cleanup
  }
}

class TestServiceWithInitError extends ServiceBase {
  public async initialize(): Promise<void> {
    throw new Error("Initialization failed");
  }

  public async cleanup(): Promise<void> {
    // Simple cleanup
  }
}

// Additional test classes for getServiceInstance tests
class TestServiceInstance extends ServiceBase {
  public async initialize(): Promise<void> {
    // Simple initialization
  }

  public async cleanup(): Promise<void> {
    // Simple cleanup
  }
}

class TestServiceInstance2 extends ServiceBase {
  public async initialize(): Promise<void> {
    // Simple initialization
  }

  public async cleanup(): Promise<void> {
    // Simple cleanup
  }
}

class TestServiceStatus extends ServiceBase {
  public async initialize(): Promise<void> {
    // Simple initialization
  }

  public async cleanup(): Promise<void> {
    // Simple cleanup
  }
}

class TestServiceStatusFalse extends ServiceBase {
  public async initialize(): Promise<void> {
    // Simple initialization
  }

  public async cleanup(): Promise<void> {
    // Simple cleanup
  }
}

describe("Singleton Base - Branch Coverage", () => {
  beforeEach(() => {
    SingletonBase.clearInstances();
    // Don't restore mocks here - ErrorUtils needs to work properly
  });

  afterEach(() => {
    SingletonBase.clearInstances();
    jest.restoreAllMocks();
  });

  describe("SingletonBase - getInstance branches", () => {
    it("should create instance when it doesn't exist (line 38-40)", () => {
      const instance1 = TestSingleton.getInstance();
      expect(instance1).toBeInstanceOf(TestSingleton);
      expect(instance1.value).toBe("test");
    });

    it("should return existing instance when it exists (line 38-41)", () => {
      const instance1 = TestSingleton.getInstance();
      const instance2 = TestSingleton.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should throw when trying to instantiate directly after getInstance (line 21-31)", () => {
      // First create instance via getInstance
      TestSingleton.getInstance();
      
      // Now try to create another instance directly - should throw
      expect(() => {
        new TestSingleton();
      }).toThrow(ServiceError);
    });

    it("should check if instance exists (line 54-56)", () => {
      expect(TestSingleton.hasInstance()).toBe(false);
      TestSingleton.getInstance();
      expect(TestSingleton.hasInstance()).toBe(true);
    });
  });

  describe("ServiceBase - getServiceInstance branches", () => {
    it("should handle initialization failure (line 154-165)", async () => {
      await expect(
        ServiceBase.getServiceInstance(TestServiceWithInitError)
      ).rejects.toThrow(ServiceError);
    });
  });

  describe("ServiceBase - ensureInitialized branches", () => {
    it("should initialize when not initialized (line 109-119)", async () => {
      class TestServiceManual extends ServiceBase {
        public async initialize(): Promise<void> {
          // Simple initialization
          this.initialized = true;
        }

        public async cleanup(): Promise<void> {
          // Simple cleanup
        }

        public async testEnsureInitialized(): Promise<void> {
          await this.ensureInitialized();
        }
      }

      const instance = new TestServiceManual();
      expect(instance.isReady()).toBe(false);
      await instance.testEnsureInitialized();
      expect(instance.isReady()).toBe(true);
      await instance.cleanup();
    });

    it("should wait when initializing (line 110-116)", async () => {
      class TestServiceConcurrent extends ServiceBase {
        public async initialize(): Promise<void> {
          // Simulate slow initialization
          await new Promise((resolve) => setTimeout(resolve, 50));
          this.initialized = true;
        }

        public async cleanup(): Promise<void> {
          // Simple cleanup
        }

        public async testEnsureInitialized(): Promise<void> {
          await this.ensureInitialized();
        }
      }

      const instance = new TestServiceConcurrent();
      
      // Start initialization
      instance.initializing = true;
      const initPromise = instance.initialize().then(() => {
        instance.initializing = false;
      });
      
      // Call ensureInitialized while initializing
      const ensurePromise = instance.testEnsureInitialized();
      
      // Wait for both to complete
      await Promise.all([initPromise, ensurePromise]);
      expect(instance.isReady()).toBe(true);
      
      await instance.cleanup();
    });

    it("should return early when already initialized (line 109-120)", async () => {
      class TestServiceInitialized extends ServiceBase {
        public async initialize(): Promise<void> {
          this.initialized = true;
        }

        public async cleanup(): Promise<void> {
          // Simple cleanup
        }

        public async testEnsureInitialized(): Promise<void> {
          await this.ensureInitialized();
        }
      }

      const instance = new TestServiceInitialized();
      await instance.initialize();
      expect(instance.isReady()).toBe(true);
      
      // Call ensureInitialized when already initialized
      await instance.testEnsureInitialized();
      expect(instance.isReady()).toBe(true);
      
      await instance.cleanup();
    });
  });

  describe("ServiceBase - getStatus branches", () => {
    it("should return status with initialized false", () => {
      const instance = new TestServiceStatusFalse();
      const status = instance.getStatus();
      expect(status.initialized).toBe(false);
      expect(status.initializing).toBe(false);
    });

    it("should return status with initialized true", async () => {
      const instance = new TestServiceStatus();
      await instance.initialize();
      // Manually set initialized since initialize() doesn't set it (only getServiceInstance does)
      instance.initialized = true;
      const status = instance.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.initializing).toBe(false);
      await instance.cleanup();
    });
  });
});

