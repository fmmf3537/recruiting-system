import { extractResumeInfo } from '../lib/llm';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

interface ResumeParseResult {
  name: string | null;
  phone: string | null;
  email: string | null;
  gender: string | null;
  age: number | null;
  workYears: number | null;
  education: string | null;
  school: string | null;
  currentCompany: string | null;
  currentPosition: string | null;
  expectedSalary: string | null;
  workHistory: Array<{
    company: string;
    position: string;
    startDate: string | null;
    endDate: string | null;
    description: string | null;
  }>;
  skills: string[];
  rawText: string;
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function extractTextFromFile(
  buffer: Buffer,
  mimetype: string
): Promise<string> {
  switch (mimetype) {
    case 'application/pdf':
      return extractTextFromPDF(buffer);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return extractTextFromDOCX(buffer);
    default:
      throw new Error(`Unsupported file type: ${mimetype}`);
  }
}

export async function parseResume(
  buffer: Buffer,
  mimetype: string
): Promise<ResumeParseResult> {
  const rawText = await extractTextFromFile(buffer, mimetype);

  const cleanedText = rawText
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();

  if (cleanedText.length < 10) {
    throw new Error('Resume text too short or empty');
  }

  const parsed = await extractResumeInfo(cleanedText);

  return {
    name: parsed.name || null,
    phone: parsed.phone || null,
    email: parsed.email || null,
    gender: parsed.gender || null,
    age: parsed.age || null,
    workYears: parsed.workYears || null,
    education: parsed.education || null,
    school: parsed.school || null,
    currentCompany: parsed.currentCompany || null,
    currentPosition: parsed.currentPosition || null,
    expectedSalary: parsed.expectedSalary || null,
    workHistory: Array.isArray(parsed.workHistory)
      ? parsed.workHistory.map((w: any) => ({
          company: w.company || '',
          position: w.position || '',
          startDate: w.startDate || null,
          endDate: w.endDate || null,
          description: w.description || null,
        }))
      : [],
    skills: Array.isArray(parsed.skills) ? parsed.skills : [],
    rawText: cleanedText,
  };
}

export type { ResumeParseResult };
