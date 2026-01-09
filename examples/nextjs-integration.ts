/**
 * Next.js Integration Example for @zkim-platform/file-format
 * 
 * This example demonstrates how to integrate the package with Next.js applications.
 * Includes API routes, server components, and client components.
 */

import {
  ZKIMFileService,
  InMemoryStorage,
  defaultLogger,
  type IStorageBackend,
  type ZkimFileResult,
  ServiceError,
} from "@zkim-platform/file-format";
import { blake3 } from "@noble/hashes/blake3.js";
import sodium from "libsodium-wrappers-sumo";

// ============================================================================
// Server-Side: API Route Example
// ============================================================================

/**
 * Example: Next.js API Route for File Upload
 * File: app/api/files/upload/route.ts (App Router)
 * or pages/api/files/upload.ts (Pages Router)
 */

// App Router example
export async function POST(request: Request) {
  try {
    await sodium.ready;

    // Get authentication from request (headers, cookies, etc.)
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Derive user key from authentication
    const userId = "user-from-auth"; // Extract from JWT, session, etc.
    const userKey = await deriveKeyFromAuth(userId, authHeader);

    // Get platform key from environment or key management service
    const platformKey = await getPlatformKey();

    // Parse request body
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    // Read file data
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    // Create storage backend (use your actual storage)
    const storage = new InMemoryStorage(); // Replace with S3, Azure, etc.

    // Initialize file service
    const fileService = new ZKIMFileService(
      {
        enableCompression: true,
        enableIntegrityValidation: true,
      },
      defaultLogger,
      storage
    );

    await fileService.initialize();

    try {
      // Create ZKIM file
      const result = await fileService.createZkimFile(
        data,
        userId,
        platformKey,
        userKey,
        {
          fileName: file.name,
          mimeType: file.type,
        }
      );

      if (result.success && result.file) {
        return Response.json({
          success: true,
          fileId: result.file.header.fileId,
          size: result.file.header.totalSize,
        });
      } else {
        return Response.json(
          { error: result.error || "File creation failed" },
          { status: 500 }
        );
      }
    } finally {
      await fileService.cleanup();
    }
  } catch (error) {
    console.error("File upload error:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

/**
 * Example: Next.js API Route for File Download
 * File: app/api/files/[fileId]/route.ts
 */
export async function GET(
  request: Request,
  { params }: { params: { fileId: string } }
) {
  try {
    await sodium.ready;

    // Get authentication
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = "user-from-auth";
    const userKey = await deriveKeyFromAuth(userId, authHeader);
    const platformKey = await getPlatformKey();

    const storage = new InMemoryStorage();
    const fileService = new ZKIMFileService({}, defaultLogger, storage);
    await fileService.initialize();

    try {
      const result = await fileService.downloadFile(
        params.fileId,
        userId,
        platformKey,
        userKey
      );

      if (result.success && result.data) {
        return new Response(result.data, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="file"`,
          },
        });
      } else {
        return Response.json(
          { error: result.error || "File not found" },
          { status: 404 }
        );
      }
    } finally {
      await fileService.cleanup();
    }
  } catch (error) {
    console.error("File download error:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Server Component Example (Next.js 13+ App Router)
// ============================================================================

/**
 * Example: Server Component for File List
 * File: app/files/page.tsx
 */
export async function FileListServerComponent() {
  // This runs on the server
  await sodium.ready;

  // Get authentication from cookies, headers, etc.
  const userId = "user-from-session";
  const userKey = await deriveKeyFromAuth(userId, "auth-token");
  const platformKey = await getPlatformKey();

  const storage = new InMemoryStorage();
  const fileService = new ZKIMFileService({}, defaultLogger, storage);
  await fileService.initialize();

  try {
    // Search for user's files
    const searchResult = await fileService.searchFiles("", userId, 100);

    return (
      <div>
        <h1>Your Files</h1>
        <ul>
          {searchResult.results.map((file: any) => (
            <li key={file.fileId}>
              <a href={`/api/files/${file.fileId}`}>{file.fileName}</a>
            </li>
          ))}
        </ul>
      </div>
    );
  } finally {
    await fileService.cleanup();
  }
}

// ============================================================================
// Client Component Example (Next.js 13+ App Router)
// ============================================================================

/**
 * Example: Client Component for File Upload
 * File: app/files/upload/page.tsx
 * 
 * Note: Add 'use client' directive at the top
 */
"use client";

import { useState } from "react";

export function FileUploadClientComponent() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authToken")}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        setResult(`File uploaded: ${data.fileId}`);
      } else {
        setResult(`Upload failed: ${data.error}`);
      }
    } catch (error) {
      setResult(`Error: ${error instanceof Error ? error.message : "Unknown"}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        type="file"
        onChange={handleUpload}
        disabled={uploading}
      />
      {uploading && <div>Uploading...</div>}
      {result && <div>{result}</div>}
    </div>
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Derive user key from authentication
 * In production, use your actual authentication method
 */
async function deriveKeyFromAuth(
  userId: string,
  authCredential: string
): Promise<Uint8Array> {
  await sodium.ready;
  const input = `${userId}:${authCredential}`;
  return blake3(new TextEncoder().encode(input), { dkLen: 32 });
}

/**
 * Get platform key from environment or key management service
 * In production, use AWS KMS, Azure Key Vault, etc.
 */
async function getPlatformKey(): Promise<Uint8Array> {
  await sodium.ready;

  // Option 1: From environment variable (base64 encoded)
  const envKey = process.env.ZKIM_PLATFORM_KEY;
  if (envKey) {
    // Decode from base64
    return new Uint8Array(Buffer.from(envKey, "base64"));
  }

  // Option 2: From key management service
  // const key = await keyManagementService.getKey("platform-key");
  // return key;

  // Option 3: Generate (only for development)
  // In production, this should be stored securely
  return sodium.randombytes_buf(32);
}

// ============================================================================
// Middleware Example (Next.js Middleware)
// ============================================================================

/**
 * Example: Next.js Middleware for Authentication
 * File: middleware.ts
 */
export function middleware(request: Request) {
  // Verify authentication
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Continue to route
  return;
}

export const config = {
  matcher: "/api/files/:path*",
};

// ============================================================================
// Environment Variables Example
// ============================================================================

/**
 * .env.local example:
 * 
 * ZKIM_PLATFORM_KEY=base64-encoded-platform-key
 * ZKIM_STORAGE_TYPE=s3
 * ZKIM_S3_BUCKET=my-bucket
 * ZKIM_S3_REGION=us-east-1
 */

