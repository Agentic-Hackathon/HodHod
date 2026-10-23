"""لایه‌ی ارتباط با LLM. فعلاً فقط چت متنی ساده؛ در گام‌های بعد tool-calling اضافه می‌شود."""
from django.conf import settings

SYSTEM_PROMPT = """تو «هدهد»، دستیار هوشمند خرید حضوری در تهران، هستی. به فارسی، کوتاه و دوستانه جواب بده.
به کاربر کمک می‌کنی محصول مناسب را پیدا کند، فروشگاه مناسب را انتخاب کند و به مغازه برسد.
قوانین:
- قیمت، موجودی یا مشخصاتی را از خودت نساز. اگر داده‌ای نداری صادقانه بگو.
- قیمت ثبت‌شده با موجودی تأییدشده یکی نیست.
- اگر کاربر نمی‌داند چه مدلی می‌خواهد، با حداکثر سه سؤال کوتاه (بودجه، کاربرد، برند) راهنمایی‌اش کن."""


class LLMError(Exception):
    pass


def chat(messages: list[dict]) -> str:
    """messages: [{"role": "user"|"assistant", "content": str}, ...]"""
    if not settings.LLM_API_KEY:
        raise LLMError("LLM_API_KEY در فایل .env تنظیم نشده است.")

    provider = settings.LLM_PROVIDER.lower()
    try:
        if provider == "anthropic":
            return _anthropic(messages)
        if provider == "openai":
            return _openai(messages)
    except LLMError:
        raise
    except Exception as exc:  # خطای شبکه/کلید/مدل
        raise LLMError(f"خطا در ارتباط با LLM: {exc}") from exc
    raise LLMError(f"LLM_PROVIDER نامعتبر است: {provider}")


def _anthropic(messages):
    import anthropic

    client = anthropic.Anthropic(api_key=settings.LLM_API_KEY, base_url=settings.LLM_BASE_URL)
    resp = client.messages.create(
        model=settings.LLM_MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=messages,
    )
    return "".join(b.text for b in resp.content if b.type == "text")


def _openai(messages):
    from openai import OpenAI

    client = OpenAI(api_key=settings.LLM_API_KEY, base_url=settings.LLM_BASE_URL)
    resp = client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=[{"role": "system", "content": SYSTEM_PROMPT}, *messages],
    )
    return resp.choices[0].message.content or ""
