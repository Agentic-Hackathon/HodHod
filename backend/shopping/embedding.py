"""Opt-in pgvector semantic retrieval. Disabled by default, with no network or GPU use in default path."""
from functools import lru_cache
import logging
from django.conf import settings
from django.db import connection, DatabaseError

logger=logging.getLogger(__name__)

@lru_cache(maxsize=1)
def model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(settings.SEMANTIC_MODEL)


def encode(texts, batch_size=32):
    return model().encode(texts,batch_size=batch_size,normalize_embeddings=True,show_progress_bar=False)


def vector_literal(values):
    return '['+','.join(f'{float(v):.8f}' for v in values)+']'


def semantic_candidates(query, limit=250):
    if not settings.SEMANTIC_SEARCH or connection.vendor!='postgresql':
        return []
    try:
        v=encode([query])[0]
        with connection.cursor() as c:
            c.execute('SELECT product_id, (1 - (embedding <=> %s::vector)) AS score FROM shopping_product_embedding ORDER BY embedding <=> %s::vector LIMIT %s',
                      [vector_literal(v),vector_literal(v),int(limit)])
            return [(int(x), max(0,min(1,float(y)))) for x,y in c.fetchall()]
    except (ImportError,DatabaseError,RuntimeError,OSError) as exc:
        logger.warning('Semantic retrieval unavailable; lexical retrieval continues: %s',type(exc).__name__)
        return []
