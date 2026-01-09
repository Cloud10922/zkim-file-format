# React & Next.js Integration

Complete guide for integrating `@zkim-platform/file-format` with React and Next.js applications.

---

## Overview

This guide covers:
- React hooks and context for file service
- Next.js API routes for server-side operations
- Next.js Server Components (App Router)
- Next.js Client Components
- Authentication integration
- Best practices

---

## React Integration

### Installation

```bash
npm install @zkim-platform/file-format
```

### Basic Setup

Create a file service provider:

```typescript
// FileServiceProvider.tsx
import { FileServiceProvider } from "@zkim-platform/file-format/examples/react-integration";
import { InMemoryStorage } from "@zkim-platform/file-format";
import { useUserKey } from "@zkim-platform/file-format/examples/react-integration";

function App() {
  const userId = "user-123";
  const authCredential = "auth-token";
  const userKey = useUserKey(userId, authCredential);
  const platformKey = getPlatformKey(); // From secure storage

  if (!userKey) {
    return <div>Loading...</div>;
  }

  return (
    <FileServiceProvider
      storage={new InMemoryStorage()}
      platformKey={platformKey}
      userId={userId}
      userKey={userKey}
    >
      <YourApp />
    </FileServiceProvider>
  );
}
```

### Using the File Service Hook

```typescript
import { useFileService } from "@zkim-platform/file-format/examples/react-integration";

function FileUpload() {
  const { createFile, isInitialized } = useFileService();
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const result = await createFile(data, {
        fileName: file.name,
        mimeType: file.type,
      });
      if (result.success) {
        console.log("File uploaded:", result.file.header.fileId);
      }
    } finally {
      setUploading(false);
    }
  };

  if (!isInitialized) {
    return <div>Initializing...</div>;
  }

  return <input type="file" onChange={(e) => handleUpload(e.target.files[0])} />;
}
```

### Complete Example

See `examples/react-integration.tsx` for:
- `FileServiceProvider` - Context provider
- `useFileService` - Hook to access file service
- `useUserKey` - Hook to derive user key
- `FileUploadComponent` - Upload component
- `FileDownloadComponent` - Download component
- `FileSearchComponent` - Search component

---

## Next.js Integration

### App Router (Next.js 13+)

#### API Route: File Upload

```typescript
// app/api/files/upload/route.ts
import { ZKIMFileService, InMemoryStorage } from "@zkim-platform/file-format";
import { POST } from "next/server";

export async function POST(request: Request) {
  // Get authentication
  const authHeader = request.headers.get("authorization");
  const userId = extractUserId(authHeader);
  const userKey = await deriveKeyFromAuth(userId, authHeader);
  const platformKey = await getPlatformKey();

  // Initialize service
  const storage = new InMemoryStorage();
  const fileService = new ZKIMFileService({}, undefined, storage);
  await fileService.initialize();

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const data = new Uint8Array(await file.arrayBuffer());

    const result = await fileService.createZkimFile(
      data,
      userId,
      platformKey,
      userKey,
      { fileName: file.name, mimeType: file.type }
    );

    if (result.success) {
      return Response.json({ fileId: result.file.header.fileId });
    }
  } finally {
    await fileService.cleanup();
  }
}
```

#### API Route: File Download

```typescript
// app/api/files/[fileId]/route.ts
import { GET } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: { fileId: string } }
) {
  const authHeader = request.headers.get("authorization");
  const userId = extractUserId(authHeader);
  const userKey = await deriveKeyFromAuth(userId, authHeader);
  const platformKey = await getPlatformKey();

  const storage = new InMemoryStorage();
  const fileService = new ZKIMFileService({}, undefined, storage);
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
        headers: { "Content-Type": "application/octet-stream" },
      });
    }
  } finally {
    await fileService.cleanup();
  }
}
```

#### Server Component

```typescript
// app/files/page.tsx
import { ZKIMFileService, InMemoryStorage } from "@zkim-platform/file-format";

export default async function FilesPage() {
  const userId = await getUserId(); // From session, cookies, etc.
  const userKey = await getUserKey(userId);
  const platformKey = await getPlatformKey();

  const storage = new InMemoryStorage();
  const fileService = new ZKIMFileService({}, undefined, storage);
  await fileService.initialize();

  try {
    const searchResult = await fileService.searchFiles("", userId, 100);

    return (
      <div>
        <h1>Your Files</h1>
        <ul>
          {searchResult.results.map((file) => (
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
```

#### Client Component

```typescript
// app/files/upload/page.tsx
"use client";

import { useState } from "react";

export default function UploadPage() {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/files/upload", {
      method: "POST",
      body: formData,
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });

    const data = await response.json();
    console.log("Uploaded:", data.fileId);
    setUploading(false);
  };

  return (
    <input
      type="file"
      onChange={(e) => handleUpload(e.target.files[0])}
      disabled={uploading}
    />
  );
}
```

### Pages Router (Next.js 12 and earlier)

#### API Route

```typescript
// pages/api/files/upload.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { ZKIMFileService, InMemoryStorage } from "@zkim-platform/file-format";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const userId = extractUserId(req);
  const userKey = await deriveKeyFromAuth(userId, req.headers.authorization);
  const platformKey = await getPlatformKey();

  const storage = new InMemoryStorage();
  const fileService = new ZKIMFileService({}, undefined, storage);
  await fileService.initialize();

  try {
    // Handle file upload
    const result = await fileService.createZkimFile(/* ... */);
    res.json({ fileId: result.file.header.fileId });
  } finally {
    await fileService.cleanup();
  }
}
```

---

## Authentication Integration

### JWT Authentication

```typescript
import jwt from "jsonwebtoken";

async function getUserIdFromRequest(request: Request): Promise<string> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    throw new Error("Unauthorized");
  }

  const token = authHeader.replace("Bearer ", "");
  const decoded = jwt.verify(token, process.env.JWT_SECRET) as { sub: string };
  return decoded.sub;
}

async function deriveKeyFromJWT(userId: string, token: string): Promise<Uint8Array> {
  await sodium.ready;
  const input = `${userId}:${token}`;
  return blake3(new TextEncoder().encode(input), { dkLen: 32 });
}
```

### NextAuth.js Integration

```typescript
import { getServerSession } from "next-auth";

async function getUserIdFromSession(): Promise<string> {
  const session = await getServerSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session.user.id;
}
```

---

## Best Practices

### 1. Initialize Service Once

```typescript
// ❌ BAD: Creating new service for each request
export async function POST(request: Request) {
  const fileService = new ZKIMFileService({}, undefined, storage);
  await fileService.initialize();
  // ...
}

// ✅ GOOD: Reuse service instance (with proper cleanup)
let fileService: ZKIMFileService | null = null;

export async function POST(request: Request) {
  if (!fileService) {
    fileService = new ZKIMFileService({}, undefined, storage);
    await fileService.initialize();
  }
  // ...
}
```

### 2. Always Clean Up

```typescript
// ✅ GOOD: Always cleanup
try {
  await fileService.createZkimFile(...);
} finally {
  await fileService.cleanup();
}
```

### 3. Handle Errors Properly

```typescript
// ✅ GOOD: Proper error handling
try {
  const result = await fileService.createZkimFile(...);
  if (result.success) {
    // Handle success
  } else {
    // Handle failure
  }
} catch (error) {
  if (error instanceof ServiceError) {
    // Handle service error
  } else {
    // Handle unexpected error
  }
}
```

### 4. Secure Key Storage

```typescript
// ❌ BAD: Keys in environment variables (plaintext)
const platformKey = process.env.PLATFORM_KEY;

// ✅ GOOD: Use key management service
const platformKey = await keyManagementService.getKey("platform-key");
```

---

## Complete Examples

See the following files for complete examples:

- `examples/react-integration.tsx` - React hooks and components
- `examples/nextjs-integration.ts` - Next.js API routes and components

---

## See Also

- **[Getting Started](Getting-Started)** - Basic setup
- **[Authentication Integration](Authentication-Integration)** - Key derivation
- **[Storage Integration](Storage-Integration)** - Storage backends
- **[API Reference](API-Reference)** - Complete API docs

---

**Last Updated:** 2026-01-09

