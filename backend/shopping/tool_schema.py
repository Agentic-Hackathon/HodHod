"""One shared whitelist/schema for both LLM providers; never evaluate arbitrary model output."""
TOOLS = [
    {'name':'search_products','description':'Find real catalogue products from the Tehran dataset; returns a candidate_set_id. Use for every new product request.',
     'properties':{'query':{'type':'string','description':'Exact product/model keywords or category in Persian or English'}, 'filters':{'type':'object','description':'Optional brand, category, min_price, max_price, installment, torobpay, fast_delivery, area, provider'},'session_id':{'type':'string'}},'required':['query']},
    {'name':'get_facets','description':'See candidate distribution of brands, categories, price bands to choose a useful clarification question.',
     'properties':{'candidate_set_id':{'type':'string'}},'required':['candidate_set_id']},
    {'name':'ask_clarification','description':'Suggest a data-driven one-question multi-choice clarification with high candidate-reduction potential.',
     'properties':{'candidate_set_id':{'type':'string'}},'required':['candidate_set_id']},
    {'name':'fetch_candidates','description':'Fetch actual products; do not invent products or specifications.',
     'properties':{'candidate_set_id':{'type':'string'},'offset':{'type':'integer'},'limit':{'type':'integer'},'product_ids':{'type':'array','items':{'type':'integer'}}},'required':['candidate_set_id']},
    {'name':'find_shops_for_product','description':'Get actual listing offers and store coordinates for one product. A listing does not prove in-store stock.',
     'properties':{'product_id':{'type':'integer'},'filters':{'type':'object'}},'required':['product_id']},
    {'name':'compare_offers','description':'Compare actual store listings by price, update recency, and warranty.',
     'properties':{'offer_ids':{'type':'array','items':{'type':'integer'}}},'required':['offer_ids']},
    {'name':'find_nearby_shops','description':'Find actual offer-bearing shops near an explicitly supplied coordinate.',
     'properties':{'lat':{'type':'number'},'lng':{'type':'number'},'radius_km':{'type':'number'},'product_id':{'type':'integer'},'installment':{'type':'boolean'}},'required':['lat','lng']},
    {'name':'rank_candidates','description':'Transparent rerank of candidate products by query relevance, seller coverage, price and offer freshness.',
     'properties':{'candidate_set_id':{'type':'string'},'preferences':{'type':'object'},'limit':{'type':'integer'}},'required':['candidate_set_id']},
    {'name':'build_shopping_plan','description':'Construct approximate greedy shopping plan from explicit desired product IDs; route order uses straight-line distances, not a travel-time estimate.',
     'properties':{'product_ids':{'type':'array','items':{'type':'integer'}},'lat':{'type':'number'},'lng':{'type':'number'},'installment':{'type':'boolean'}},'required':['product_ids']},
]
TOOL_BY_NAME = {x['name']: x for x in TOOLS}


def openai_tools():
    return [{'type':'function','function':{'name':t['name'],'description':t['description'], 'parameters':{'type':'object','properties':t['properties'],'required':t['required'],'additionalProperties':False}}} for t in TOOLS]


def anthropic_tools():
    return [{'name':t['name'],'description':t['description'], 'input_schema':{'type':'object','properties':t['properties'],'required':t['required'],'additionalProperties':False}} for t in TOOLS]
