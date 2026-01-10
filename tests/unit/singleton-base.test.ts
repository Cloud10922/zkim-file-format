/**
 * Singleton Base Tests
 * Tests for singleton pattern base classes
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { SingletonBase, ServiceBase } from "../../src/utils/singleton-base";

// Test singleton class
class TestSingleton extends SingletonBase {
  public value = "test";
}

// Test service class
class TestService extends ServiceBase {
  public async initialize(): Promise<void> {
    this.initialized = true;
  }

  public async cleanup(): Promise<void> {
    this.initialized = false;
  }
}

describe("SingletonBase", () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    await SingletonBase.clearInstances();
  });

  afterEach(async () => {
    jest.clearAllTimers();
    await SingletonBase.clearInstances();
    jest.useRealTimers();
  });

  describe("getInstance", () => {
    it("should return same instance on multiple calls", () => {
      const instance1 = TestSingleton.getInstance();
      const instance2 = TestSingleton.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should maintain instance state", () => {
      const instance1 = TestSingleton.getInstance();
      instance1.value = "modified";
      const instance2 = TestSingleton.getInstance();
      expect(instance2.value).toBe("modified");
    });
  });

  describe("hasInstance", () => {
    it("should return false before instance created", () => {
      expect(SingletonBase.hasInstance.call(TestSingleton)).toBe(false);
    });

    it("should return true after instance created", () => {
      TestSingleton.getInstance();
      expect(SingletonBase.hasInstance.call(TestSingleton)).toBe(true);
    });
  });

  describe("clearInstances", () => {
    it("should clear all instances", async () => {
      TestSingleton.getInstance();
      expect(SingletonBase.hasInstance.call(TestSingleton)).toBe(true);
      
      await SingletonBase.clearInstances();
      expect(SingletonBase.hasInstance.call(TestSingleton)).toBe(false);
    });

    it("should cleanup ServiceBase instances", async () => {
      const service = new TestService();
      await service.initialize();
      expect(service.initialized).toBe(true);
      
      await SingletonBase.clearInstances();
      // Service should be cleaned up
      expect(SingletonBase.hasInstance.call(TestService)).toBe(false);
    });
  });
});

describe("ServiceBase", () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    await SingletonBase.clearInstances();
  });

  afterEach(async () => {
    jest.clearAllTimers();
    await SingletonBase.clearInstances();
    jest.useRealTimers();
  });

  describe("getServiceInstance", () => {
    it("should return service instance", async () => {
      const service = await ServiceBase.getServiceInstance.call(TestService);
      expect(service).toBeInstanceOf(TestService);
    });

    it("should initialize service on first call", async () => {
      const service = await ServiceBase.getServiceInstance.call(TestService);
      expect(service.initialized).toBe(true);
    });

    it("should return same instance on multiple calls", async () => {
      const service1 = await ServiceBase.getServiceInstance.call(TestService);
      const service2 = await ServiceBase.getServiceInstance.call(TestService);
      expect(service1).toBe(service2);
    });
  });

  describe("isReady", () => {
    it("should return false before initialization", () => {
      const service = new TestService();
      expect(service.isReady()).toBe(false);
    });

    it("should return true after initialization", async () => {
      const service = new TestService();
      await service.initialize();
      expect(service.isReady()).toBe(true);
    });
  });

  describe("getStatus", () => {
    it("should return service status", async () => {
      const service = new TestService();
      const status = service.getStatus();
      expect(status).toHaveProperty("initialized");
      expect(status).toHaveProperty("serviceName");
    });
  });
});

