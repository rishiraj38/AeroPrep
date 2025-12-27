"use client";

import React, { useState } from 'react';
import { IKContext, IKUpload } from 'imagekitio-react';
import { Loader2, CheckCircle, UploadCloud, AlertTriangle } from 'lucide-react';

const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';
const urlEndpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
const publicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;

interface ResumeUploaderProps {
  onUploadSuccess: (url: string) => void;
  onUploadStart?: () => void;
  className?: string;
}

export default function ResumeUploader({ onUploadSuccess, onUploadStart, className }: ResumeUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authenticatior = async () => {
    try {
      const response = await fetch(`${backendUrl}/imagekit-auth`);
  
      if (!response.ok) {
        throw new Error(`Authentication request failed: ${response.statusText}`);
      }
  
      const data = await response.json();
      const { signature, expire, token } = data;
      return { signature, expire, token };
    } catch (error: any) {
      setError(`Auth failed: ${error.message}`);
      throw new Error(`Authentication request failed: ${error.message}`);
    }
  };

  const onError = (err: any) => {
    console.error("Upload Error", err);
    setError("Upload failed. Please try again.");
    setUploading(false);
  };

  const onSuccess = (res: any) => {
    console.log("Upload Success", res);
    setUploading(false);
    setFileName(res.name);
    onUploadSuccess(res.url); // Pass back the URL
    setError(null);
  };

  const onUploadProgress = (progress: ProgressEvent) => {
    // Optional: could calculate percentage here
  };

  if (!urlEndpoint || !publicKey) {
    return (
        <div className="p-4 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-md text-sm border border-red-200">
            Missing ImageKit Env Variables (NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT, NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY)
        </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      <IKContext 
        urlEndpoint={urlEndpoint} 
        publicKey={publicKey} 
        authenticator={authenticatior} 
      >
        <div className="relative border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 transition-colors rounded-xl p-8 text-center bg-muted/5 group cursor-pointer">
            <IKUpload
                fileName="resume.pdf"
                useUniqueFileName={true}
                validateFile={(file: any) => file.size < 5000000} // 5MB limit
                accept=".pdf"
                onError={onError}
                onSuccess={onSuccess}
                onUploadStart={() => {
                    setUploading(true);
                    setError(null);
                    onUploadStart?.();
                }}
                onUploadProgress={onUploadProgress}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            
            <div className="flex flex-col items-center gap-3">
                {uploading ? (
                    <Loader2 className="h-10 w-10 text-primary animate-spin" />
                ) : fileName ? (
                    <CheckCircle className="h-10 w-10 text-green-500" />
                ) : (
                    <UploadCloud className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors" />
                )}
                
                <div className="space-y-1">
                    <h3 className="font-semibold text-lg">
                        {uploading ? "Uploading..." : fileName ? "Upload Complete!" : "Click to Upload Resume"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {fileName || "PDF files up to 5MB"}
                    </p>
                </div>
            </div>
        </div>

        {error && (
            <div className="mt-3 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 rounded-md text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> {error}
            </div>
        )}
      </IKContext>
    </div>
  );
}
