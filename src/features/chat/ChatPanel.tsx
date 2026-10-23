import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Camera,
  Check,
  History,
  ImagePlus,
  MessageSquare,
  Mic,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useStore, db, type Session } from "../../state/store";
import { fa, date } from "../../i18n/format";
import {
  AgentProgress,
  Badge,
  Button,
  Dialog,
  IconButton,
  ToolActivityTimeline,
} from "../../components/primitives";
import {
  BrowserSpeechProvider,
  imageUnderstanding,
  validateImage,
  audioTranscription,
} from "./inputs";
import type { Action } from "../../data/types";
export function ChatMessage({
  role,
  text,
}: {
  role: "user" | "assistant";
  text: string;
}) {
  return (
    <div className={`chat-message ${role}`}>
      {role === "assistant" && (
        <div className="assistant-avatar">
          <Sparkles size={17} />
        </div>
      )}
      <div>
        <span className="message-author">
          {role === "assistant" ? "هدهد" : "شما"}
        </span>
        <p dir="auto">{text}</p>
      </div>
    </div>
  );
}
export function ChatComposer({
  remote = false,
  onSend,
  onAction,
  busy,
  onCancel,
  imageRequested,
}: {
  remote?: boolean;
  onSend: (text: string) => void;
  onAction: (a: Action) => void;
  busy: boolean;
  onCancel: () => void;
  imageRequested: number;
}) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [imageStatus, setImageStatus] = useState("");
  const [audioName, setAudioName] = useState("");
  const audioInput = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const speech = useRef(new BrowserSpeechProvider());
  const imageAnalysis=useRef<AbortController | null>(null);
  useEffect(() => {
    if (imageRequested) input.current?.click();
  }, [imageRequested]);
  useEffect(
    () => () => {
      speech.current.stop();
      imageAnalysis.current?.abort();
    },
    [],
  );
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image.url);
    },
    [image],
  );
  const attach = async (file?: File) => {
    if (!file) return;
    const err = validateImage(file);
    if (err) {
      setError(err);
      return;
    }
    setError("");
    imageAnalysis.current?.abort();
    const controller=new AbortController();
    imageAnalysis.current=controller;
    setImage({ file, url: URL.createObjectURL(file) });
    if(remote) {
      setImageStatus('در حال شناسایی کالا…');
      const result=await imageUnderstanding.analyze(file,controller.signal);
      if(controller.signal.aborted)return;
      setImageStatus(result.status==='ready' ? 'عبارت شناسایی‌شده را پیش از ارسال بررسی کنید.' : result.text);
      if(result.status==='ready')setText(result.text);
    } else setImageStatus('تصویر پیوست شد؛ تشخیص تصویری در حالت آزمایشی فعال نیست.');
    onAction({
      type: "image.attach",
      payload: { name: file.name, type: file.type, size: file.size },
    });
  };
  const send = () => {
    if (!text.trim() || busy) return;
    onSend(text.trim());
    setText("");
    imageAnalysis.current?.abort();
    setImage(null);
  };
  return (
    <div
      className="composer-wrap"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        attach(e.dataTransfer.files[0]);
      }}
    >
      {image && (
        <div className="attachment-preview">
          <img src={image.url} alt="پیش‌نمایش تصویر پیوست‌شده" />
          <div>
            <strong>{image.file.name}</strong>
            <small>{imageStatus}</small>
          </div>
          <IconButton
            label="حذف تصویر"
            onClick={() => {
              imageAnalysis.current?.abort();
              setImage(null);
              setImageStatus("");
            }}
          >
            <X size={15} />
          </IconButton>
        </div>
      )}
      {error && (
        <p role="alert" className="input-error">
          {error}
        </p>
      )}
      <div className={`composer ${listening ? "listening" : ""}`}>
        {audioName && (
          <p className="notice">
            فایل صوتی «{audioName}» انتخاب شد؛ سرویس تبدیل فایل صوتی هنوز متصل
            نیست. فایل ذخیره یا ارسال نمی‌شود.
          </p>
        )}
        {error && (
          <Button variant="ghost" onClick={() => audioInput.current?.click()}>
            انتخاب فایل صوتی برای رابط آینده
          </Button>
        )}
        <input
          ref={audioInput}
          hidden
          type="file"
          accept="audio/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (
              !file.type.startsWith("audio/") ||
              file.size > 20 * 1024 * 1024
            ) {
              setError(
                "فایل صوتی معتبر با حجم کمتر از ۲۰ مگابایت انتخاب کنید.",
              );
              return;
            }
            setAudioName(file.name);
            const reply = await audioTranscription.transcribe(
              file,
              new AbortController().signal,
            );
            if (reply.status === "ready" && reply.text) setText(reply.text);
            e.target.value = "";
          }}
        />
        <textarea
          aria-label="پیام به دستیار"
          placeholder="چی می‌خوای بخری؟ از من بپرس…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="composer-actions">
          <div>
            <IconButton
              label="پیوست تصویر"
              onClick={() => input.current?.click()}
            >
              <ImagePlus size={19} />
            </IconButton>
            <IconButton
              label="گرفتن عکس با دوربین"
              onClick={() => camera.current?.click()}
            >
              <Camera size={18} />
            </IconButton>
            <IconButton
              label={listening ? "پایان ضبط صدا" : "تایپ با صدا"}
              onClick={() => {
                setError("");
                if (listening) {
                  speech.current.stop();
                  setListening(false);
                } else if (!speech.current.available()) {
                  setError(
                    "تبدیل صوت در این مرورگر پشتیبانی نمی‌شود؛ سرویس جایگزین هنوز متصل نیست. لطفاً تایپ کنید.",
                  );
                } else {
                  try {
                    setListening(true);
                    speech.current.start(
                      (value) => {
                        setText(value);
                        onAction({
                          type: "voice.transcription.edit",
                          payload: { text: value },
                        });
                      },
                      setError,
                      () => setListening(false),
                    );
                  } catch {
                    setListening(false);
                    setError("شروع میکروفن ممکن نشد.");
                  }
                }
              }}
              className={listening ? "active" : ""}
            >
              {listening ? <Square size={17} /> : <Mic size={19} />}
            </IconButton>
          </div>
          {busy ? (
            <IconButton label="لغو درخواست" onClick={onCancel}>
              <Square size={17} />
            </IconButton>
          ) : (
            <button
              className="send-button"
              aria-label="ارسال پیام"
              disabled={!text.trim()}
              onClick={send}
            >
              <ArrowUp size={20} />
            </button>
          )}
        </div>
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          attach(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={camera}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          attach(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <p className="composer-note">
        {listening
          ? "در حال شنیدن؛ متن را پیش از ارسال ویرایش کنید."
          : remote
            ? "متن را پیش از ارسال بررسی و ویرایش کنید."
            : "انتخاب بهتر، با گفت‌وگو"}
      </p>
    </div>
  );
}
export function ShoppingSessionCard({
  session,
  onRestore,
  onDelete,
  onRename,
}: {
  session: Session;
  onRestore: () => void;
  onDelete: () => void;
  onRename: () => void;
}) {
  return (
    <article className="session-card">
      <button className="title-button" onClick={onRestore}>
        <strong>{session.title}</strong>
        <small>
          {date(session.updatedAt)} · {fa(session.messages.length)} پیام
        </small>
      </button>
      <Button variant="ghost" onClick={onRename}>
        تغییر نام
      </Button>
      <Button variant="danger" onClick={onDelete}>
        حذف
      </Button>
    </article>
  );
}
export function ConversationHistory({
  onClose,
  onAction,
}: {
  onClose: () => void;
  onAction: (a: Action) => void;
}) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [rename, setRename] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const { restore, newSession } = useStore();
  const load = () =>
    db.sessions
      .orderBy("updatedAt")
      .reverse()
      .toArray()
      .then(setSessions)
      .catch(() => setError("تاریخچه در دسترس نیست."));
  useEffect(() => {
    load();
  }, []);
  return (
    <Dialog title="خریدهای قبلی شما" onClose={onClose}>
      <Button
        variant="primary"
        onClick={() => {
          newSession();
          onClose();
        }}
      >
        شروع خرید تازه
        <Plus size={16} />
      </Button>
      {error && <p role="alert">{error}</p>}
      {sessions.map((s) => (
        <ShoppingSessionCard
          key={s.id}
          session={s}
          onRestore={() => {
            restore(s);
            onAction({ type: "session.restore", payload: { sessionId: s.id } });
            onClose();
          }}
          onDelete={() => setPending(s.id)}
          onRename={() => {
            setRename(s.id);
            setName(s.title);
          }}
        />
      ))}
      {rename && (
        <form
          className="section"
          onSubmit={async (e) => {
            e.preventDefault();
            if (useStore.getState().session.id === rename)
              useStore.getState().set({ title: name });
            await db.sessions.update(rename, { title: name });
            setRename(null);
            load();
          }}
        >
          <label className="field">
            نام خرید
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
            />
          </label>
          <Button type="submit">ذخیرهٔ نام</Button>
        </form>
      )}
      {pending && pending !== "all" && (
        <div className="confirm-box">
          <p>این گفت‌وگو و وضعیت خرید آن حذف شود؟</p>
          <Button
            variant="danger"
            onClick={async () => {
              await db.sessions.delete(pending);
              if (useStore.getState().session.id === pending) newSession(true);
              setPending(null);
              load();
            }}
          >
            بله، حذف شود
          </Button>
          <Button onClick={() => setPending(null)}>انصراف</Button>
        </div>
      )}
      {sessions.length > 0 && (
        <Button variant="danger" onClick={() => setPending("all")}>
          پاک‌کردن تمام تاریخچه
        </Button>
      )}
      {pending === "all" && (
        <div className="confirm-box">
          <p>تمام تاریخچهٔ محلی پاک شود؟</p>
          <Button
            variant="danger"
            onClick={async () => {
              await db.sessions.clear();
              newSession(true);
              setPending(null);
              load();
            }}
          >
            تأیید پاک‌کردن همه
          </Button>
        </div>
      )}
    </Dialog>
  );
}
export function ChatPanel({
  remote = false,
  onSend,
  onAction,
  busy,
  progress,
  onCancel,
  onHistory,
  imageRequested,
}: {
  remote?: boolean;
  onSend: (text: string) => void;
  onAction: (a: Action) => void;
  busy: boolean;
  progress: string;
  onCancel: () => void;
  onHistory: () => void;
  imageRequested: number;
}) {
  const s = useStore((x) => x.session);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [s.messages.length, busy]);
  return (
    <aside className="chat-panel">
      <header className="chat-header">
        <div>
          <span className="assistant-avatar">
            <Sparkles size={21} />
          </span>
          <div>
            <h2>هدهد، همراه خرید شما</h2>
            <small>
              <span className="status-dot" />
              همراه برای انتخاب بهتر
            </small>
          </div>
        </div>
        <IconButton label="گفت‌وگوهای قبلی" onClick={onHistory}>
          <History size={19} />
        </IconButton>
      </header>
      <div className="chat-scroll">
        <div className="chat-day">همین‌جا، یک خرید تازه</div>
        <ChatMessage
          role="assistant"
          text="سلام! من همراه خرید حضوری شما هستم. دنبال چه کالایی می‌گردید؟ نام کالا را بنویسید یا از پیشنهادهای روبه‌رو شروع کنید."
        />
        {!s.messages.length && (
          <div className="chat-starters">
            <button onClick={() => onSend("هدفون")}>
              <MessageSquare size={14} />
              یک هدفون خوب می‌خوام
            </button>
            <button
              onClick={() =>
                onAction({ type: "location.change", payload: { open: true } })
              }
            >
              <SlidersHorizontal size={14} />
              فروشگاه‌های نزدیک من
            </button>
          </div>
        )}
        {s.messages.map((m) => (
          <ChatMessage key={m.id} role={m.role} text={m.text} />
        ))}
        {!!s.agentContext?.activity?.length && <details className="agent-tool-activity">
          <summary>مراحل بررسی درخواست</summary>
          <ToolActivityTimeline items={s.agentContext.activity.map(name => ({search_products:'جست‌وجوی کالاها',get_facets:'بررسی ویژگی‌ها',ask_clarification:'انتخاب سؤال تکمیلی',rank_candidates:'رتبه‌بندی گزینه‌ها',find_shops_for_product:'یافتن فروشندگان',compare_offers:'مقایسهٔ پیشنهادها',find_nearby_shops:'بررسی فروشگاه‌های نزدیک',render_workspace:'آماده‌کردن نمای خرید',build_shopping_plan:'تنظیم برنامهٔ خرید',fetch_candidates:'دریافت گزینه‌ها'}[name] || 'بررسی اطلاعات خرید'))} />
        </details>}
        {busy && <AgentProgress text={progress} />}
        <div ref={end} />
      </div>
      <div className="chat-trust">
        <Check size={14} />
      </div>
      <ChatComposer
        remote={remote}
        onSend={onSend}
        onAction={onAction}
        busy={busy}
        onCancel={onCancel}
        imageRequested={imageRequested}
      />
    </aside>
  );
}
