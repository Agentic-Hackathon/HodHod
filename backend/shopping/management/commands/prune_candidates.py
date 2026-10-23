from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from shopping.models import CandidateSet

class Command(BaseCommand):
    help='Remove session-bound candidate snapshots older than 24h.'
    def handle(self,*args,**opts):
        count,_=CandidateSet.objects.filter(created_at__lt=timezone.now()-timedelta(hours=24)).delete()
        self.stdout.write(f'Deleted {count} expired records.')
