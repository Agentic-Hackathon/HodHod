export interface ImageUnderstandingAdapter {
  analyze(
    file: File,
    signal: AbortSignal,
  ): Promise<{ status: "unavailable" | "ready"; text: string }>;
}
export const imageUnderstanding: ImageUnderstandingAdapter = {
  async analyze(file,signal) {
    try {
      const bootstrap=await fetch('/api/brain/bootstrap/',{signal,credentials:'same-origin'});
      if(!bootstrap.ok) throw new Error();
      const {csrfToken}=await bootstrap.json();
      const body=new FormData();body.append('image',file);
      const reply=await fetch('/api/brain/image/',{method:'POST',credentials:'same-origin',signal,headers:{'X-CSRFToken':csrfToken},body});
      const data=await reply.json();
      if(!reply.ok) return {status:'unavailable',text:data.error || 'شناسایی تصویر انجام نشد.'};
      return data;
    } catch {return {status:'unavailable',text:'تصویر پیوست شد؛ سرویس تشخیص تصویر در دسترس نیست.'};}
  },
};
export function validateImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    return "فقط تصویر JPG، PNG یا WebP پذیرفته می‌شود.";
  if (file.size > 8 * 1024 * 1024)
    return "حجم تصویر باید کمتر از ۸ مگابایت باشد.";
  return null;
}
export interface SpeechToTextProvider {
  available(): boolean;
  start(
    onText: (text: string) => void,
    onError: (text: string) => void,
    onEnd: () => void,
  ): void;
  stop(): void;
}
export interface AudioTranscriptionAdapter {
  transcribe(
    file: File,
    signal: AbortSignal,
  ): Promise<{ status: "unavailable" | "ready"; text?: string }>;
}
export const audioTranscription: AudioTranscriptionAdapter = {
  async transcribe() {
    return { status: "unavailable" };
  },
};
export class BrowserSpeechProvider implements SpeechToTextProvider {
  private recognition: any;
  available() {
    return !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  }
  start(
    onText: (text: string) => void,
    onError: (text: string) => void,
    onEnd: () => void,
  ) {
    const C =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!C) {
      onError(
        "تبدیل گفتار در این مرورگر پشتیبانی نمی‌شود. می‌توانید تایپ کنید؛ سرویس جایگزین صوت هنوز متصل نیست.",
      );
      return;
    }
    this.recognition = new C();
    this.recognition.lang = "fa-IR";
    this.recognition.interimResults = true;
    this.recognition.onresult = (e: any) =>
      onText(
        Array.from(e.results as any[])
          .map((r: any) => r[0].transcript)
          .join(" "),
      );
    this.recognition.onerror = (e: any) => {
      onError(
        e.error === "not-allowed"
          ? "اجازهٔ میکروفن داده نشد. می‌توانید متن را تایپ کنید."
          : "دریافت صوت انجام نشد؛ دوباره تلاش کنید.",
      );
      onEnd();
    };
    this.recognition.onend = onEnd;
    this.recognition.start();
  }
  stop() {
    this.recognition?.stop();
  }
}
