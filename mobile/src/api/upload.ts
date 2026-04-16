import request from '@/lib/request';

export interface UploadResult {
  success: boolean;
  message: string;
  data: {
    originalName: string;
    filename: string;
    mimetype: string;
    size: number;
    url: string;
  };
}

export function uploadFile(file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);
  return request.post('/api/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
}
