from django.urls import path
from . import views
from . import workspace
from . import media
urlpatterns=[
    path('api/workspace/image/',media.image,name='workspace-image'),
    path('api/workspace/bootstrap/',workspace.bootstrap,name='workspace-bootstrap'),
    path('api/workspace/dispatch/',workspace.dispatch,name='workspace-dispatch'),
    path('',views.index,name='index'),
    path('api/chat/',views.chat,name='chat'),
    path('api/clarify/',views.clarify,name='clarify'),
    path('api/tools/<str:name>/',views.tool,name='tool'),
    path('api/products/<int:product_id>/offers/',views.offers,name='offers'),
    path('api/stats/',views.stats,name='stats'),
]
