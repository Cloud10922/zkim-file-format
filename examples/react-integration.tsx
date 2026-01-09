/**
 * React Integration Example for @zkim-platform/file-format
 * 
 * This example demonstrates how to integrate the package with React applications.
 * Includes hooks, context, and component examples.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  ZKIMFileService,
  InMemoryStorage,
  defaultLogger,
  type IStorageBackend,
  type ZkimFileResult,
  type ZkimFileMetadata,
  ServiceError,
} from "@zkim-platform/file-format";
import { blake3 } from "@noble/hashes/blake3.js";
import sodium from "libsodium-wrappers-sumo";

// ============================================================================
// Types
// ============================================================================

interface FileServiceContextValue {
  fileService: ZKIMFileService | null;
  isInitialized: boolean;
  error: string | null;
  createFile: (
    data: Uint8Array,
    metadata?: Partial<ZkimFileMetadata>
  ) => Promise<ZkimFileResult>;
  downloadFile: (
    fileId: string
  ) => Promise<{ success: boolean; data?: Uint8Array; error?: string }>;
  searchFiles: (query: string) => Promise<any>;
}

// ============================================================================
// Context
// ============================================================================

const FileServiceContext = createContext<FileServiceContextValue | null>(null);

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to access file service context
 */
export function useFileService(): FileServiceContextValue {
  const context = useContext(FileServiceContext);
  if (!context) {
    throw new Error("useFileService must be used within FileServiceProvider");
  }
  return context;
}

/**
 * Hook to derive user key from authentication
 * In production, replace with your actual authentication method
 */
export function useUserKey(
  userId: string | null,
  authCredential: string | null
): Uint8Array | null {
  const [userKey, setUserKey] = useState<Uint8Array | null>(null);

  useEffect(() => {
    if (!userId || !authCredential) {
      setUserKey(null);
      return;
    }

    async function deriveKey() {
      try {
        await sodium.ready;
        const input = `${userId}:${authCredential}`;
        const key = await blake3(new TextEncoder().encode(input), { dkLen: 32 });
        setUserKey(key);
      } catch (error) {
        console.error("Failed to derive user key:", error);
        setUserKey(null);
      }
    }

    deriveKey();
  }, [userId, authCredential]);

  return userKey;
}

// ============================================================================
// Provider Component
// ============================================================================

interface FileServiceProviderProps {
  children: React.ReactNode;
  storage: IStorageBackend;
  platformKey: Uint8Array;
  userId: string;
  userKey: Uint8Array;
  config?: Partial<any>;
}

export function FileServiceProvider({
  children,
  storage,
  platformKey,
  userId,
  userKey,
  config = {},
}: FileServiceProviderProps) {
  const [fileService, setFileService] = useState<ZKIMFileService | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize file service
  useEffect(() => {
    let service: ZKIMFileService | null = null;

    async function initialize() {
      try {
        await sodium.ready;

        service = new ZKIMFileService(
          {
            enableCompression: true,
            enableSearchableEncryption: false,
            enableIntegrityValidation: true,
            ...config,
          },
          defaultLogger,
          storage
        );

        await service.initialize();
        setFileService(service);
        setIsInitialized(true);
        setError(null);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to initialize file service";
        setError(errorMessage);
        setIsInitialized(false);
      }
    }

    initialize();

    // Cleanup on unmount
    return () => {
      if (service) {
        service.cleanup().catch(console.error);
      }
    };
  }, [storage, config]);

  // Create file
  const createFile = useCallback(
    async (
      data: Uint8Array,
      metadata?: Partial<ZkimFileMetadata>
    ): Promise<ZkimFileResult> => {
      if (!fileService || !isInitialized) {
        throw new Error("File service not initialized");
      }

      try {
        const result = await fileService.createZkimFile(
          data,
          userId,
          platformKey,
          userKey,
          metadata
        );
        return result;
      } catch (err) {
        if (err instanceof ServiceError) {
          throw err;
        }
        throw new ServiceError("Failed to create file", {
          code: "FILE_CREATION_ERROR",
          details: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    },
    [fileService, isInitialized, userId, platformKey, userKey]
  );

  // Download file
  const downloadFile = useCallback(
    async (
      fileId: string
    ): Promise<{ success: boolean; data?: Uint8Array; error?: string }> => {
      if (!fileService || !isInitialized) {
        return {
          success: false,
          error: "File service not initialized",
        };
      }

      try {
        const result = await fileService.downloadFile(
          fileId,
          userId,
          platformKey,
          userKey
        );
        return result;
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Failed to download file",
        };
      }
    },
    [fileService, isInitialized, userId, platformKey, userKey]
  );

  // Search files
  const searchFiles = useCallback(
    async (query: string) => {
      if (!fileService || !isInitialized) {
        return { results: [], totalResults: 0 };
      }

      try {
        const result = await fileService.searchFiles(query, userId);
        return result;
      } catch (err) {
        console.error("Search failed:", err);
        return { results: [], totalResults: 0 };
      }
    },
    [fileService, isInitialized, userId]
  );

  const value: FileServiceContextValue = {
    fileService,
    isInitialized,
    error,
    createFile,
    downloadFile,
    searchFiles,
  };

  return (
    <FileServiceContext.Provider value={value}>
      {children}
    </FileServiceContext.Provider>
  );
}

// ============================================================================
// Example Components
// ============================================================================

/**
 * Example: File Upload Component
 */
export function FileUploadComponent() {
  const { createFile, isInitialized, error } = useFileService();
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      const result = await createFile(data, {
        fileName: file.name,
        mimeType: file.type,
      });

      if (result.success && result.file) {
        setUploadResult(`File uploaded: ${result.file.header.fileId}`);
      } else {
        setUploadResult(`Upload failed: ${result.error}`);
      }
    } catch (err) {
      setUploadResult(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setUploading(false);
    }
  };

  if (!isInitialized) {
    return <div>Initializing file service...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <input
        type="file"
        onChange={handleFileUpload}
        disabled={uploading}
      />
      {uploading && <div>Uploading...</div>}
      {uploadResult && <div>{uploadResult}</div>}
    </div>
  );
}

/**
 * Example: File Download Component
 */
export function FileDownloadComponent({ fileId }: { fileId: string }) {
  const { downloadFile, isInitialized } = useFileService();
  const [downloading, setDownloading] = useState(false);
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    setFileData(null);

    try {
      const result = await downloadFile(fileId);
      if (result.success && result.data) {
        setFileData(result.data);
      } else {
        setError(result.error || "Download failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDownloading(false);
    }
  };

  if (!isInitialized) {
    return <div>Initializing...</div>;
  }

  return (
    <div>
      <button onClick={handleDownload} disabled={downloading}>
        {downloading ? "Downloading..." : "Download File"}
      </button>
      {error && <div>Error: {error}</div>}
      {fileData && (
        <div>
          <p>File downloaded: {fileData.length} bytes</p>
          <a
            href={URL.createObjectURL(new Blob([fileData]))}
            download="file"
          >
            Download
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * Example: File Search Component
 */
export function FileSearchComponent() {
  const { searchFiles, isInitialized } = useFileService();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setSearching(true);
    try {
      const result = await searchFiles(query);
      setResults(result.results || []);
    } catch (err) {
      console.error("Search error:", err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  if (!isInitialized) {
    return <div>Initializing...</div>;
  }

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search files..."
      />
      <button onClick={handleSearch} disabled={searching}>
        {searching ? "Searching..." : "Search"}
      </button>
      <div>
        {results.map((result, index) => (
          <div key={index}>{JSON.stringify(result)}</div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Usage Example
// ============================================================================

/**
 * Example: App Component with File Service
 */
export function AppExample() {
  const [platformKey, setPlatformKey] = useState<Uint8Array | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userKey, setUserKey] = useState<Uint8Array | null>(null);
  const [ready, setReady] = useState(false);

  // Initialize keys (in production, get from secure storage)
  useEffect(() => {
    async function init() {
      await sodium.ready;
      // In production, load platform key from secure storage
      const pk = sodium.randombytes_buf(32);
      setPlatformKey(pk);

      // In production, derive from actual authentication
      const uid = "user-123";
      const authCredential = "auth-token";
      const input = `${uid}:${authCredential}`;
      const uk = await blake3(new TextEncoder().encode(input), { dkLen: 32 });

      setUserId(uid);
      setUserKey(uk);
      setReady(true);
    }

    init();
  }, []);

  if (!ready || !platformKey || !userId || !userKey) {
    return <div>Initializing...</div>;
  }

  const storage = new InMemoryStorage();

  return (
    <FileServiceProvider
      storage={storage}
      platformKey={platformKey}
      userId={userId}
      userKey={userKey}
    >
      <div>
        <h1>ZKIM File Service Example</h1>
        <FileUploadComponent />
        <FileSearchComponent />
      </div>
    </FileServiceProvider>
  );
}

