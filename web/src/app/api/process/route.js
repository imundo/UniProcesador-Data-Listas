import { NextResponse } from 'next/server';
import { processFiles } from '@/lib/extractor';

export async function POST(request) {
    try {
        const formData = await request.formData();
        const files = formData.getAll('files');

        if (!files || files.length === 0) {
            return NextResponse.json({ error: 'No files provided' }, { status: 400 });
        }

        const result = await processFiles(files);
        return NextResponse.json(result);
    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
