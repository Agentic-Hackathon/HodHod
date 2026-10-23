import json

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from . import llm
from .models import Offer, Product, Shop

MAX_HISTORY = 20
MAX_CHARS = 4000


@ensure_csrf_cookie
@require_GET
def index(request):
    return render(request, "shopping/chat.html")


@require_POST
def chat(request):
    try:
        payload = json.loads(request.body)
        raw = payload["messages"]
    except (ValueError, KeyError, TypeError):
        return JsonResponse({"error": "بدنه‌ی درخواست نامعتبر است."}, status=400)

    messages = []
    for m in raw[-MAX_HISTORY:]:
        if not isinstance(m, dict) or m.get("role") not in ("user", "assistant"):
            return JsonResponse({"error": "نقش پیام نامعتبر است."}, status=400)
        content = str(m.get("content", "")).strip()[:MAX_CHARS]
        if content:
            messages.append({"role": m["role"], "content": content})

    if not messages or messages[-1]["role"] != "user":
        return JsonResponse({"error": "آخرین پیام باید از کاربر باشد."}, status=400)

    try:
        reply = llm.chat(messages)
    except llm.LLMError as exc:
        return JsonResponse({"error": str(exc)}, status=502)
    return JsonResponse({"reply": reply})


@require_GET
def stats(request):
    """برای اطمینان از موفق بودن import."""
    return JsonResponse(
        {"shops": Shop.objects.count(), "products": Product.objects.count(), "offers": Offer.objects.count()}
    )
