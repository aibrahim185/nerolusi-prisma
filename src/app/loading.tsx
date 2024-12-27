"use client";

import Image from "next/image";

export default function LoadingPage() {
  return (
    <div>
      <div className="flex h-screen flex-col items-center justify-center">
        <h1 className="text-2xl font-bold">Loading...</h1>
        <p className="mt-2">
          <Image src="/logo.png" alt="loading" width={300} height={300} />
        </p>
      </div>
    </div>
  );
}