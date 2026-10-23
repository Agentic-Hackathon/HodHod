"""Safe import of user-downloaded challenge ZIP or directory; never substitute synthetic data."""
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile, BadZipFile
from django.core.management.base import BaseCommand, CommandError
from django.core.management import call_command

NAMES={
    'shops':['shops.csv','shop.csv','stores.csv'],
    'products':['products.csv','product.csv','base_products.csv','baseproducts.csv'],
    'offers':['offers.csv','offer.csv','product_in_store.csv','productinstore.csv'],
}


class Command(BaseCommand):
    help='Import real Torob challenge dataset from a downloaded ZIP or extracted CSV folder.'
    def add_arguments(self,parser):
        parser.add_argument('path')
        parser.add_argument('--dry-run',action='store_true')
        parser.add_argument('--replace',action='store_true')
    def handle(self,*args,path,dry_run,replace,**opts):
        file=Path(path)
        if not file.exists():raise CommandError('Dataset ZIP/folder was not found.')
        with TemporaryDirectory(prefix='hodhod_import_') as tmp:
            root=file
            if file.is_file():
                try:
                    with ZipFile(file) as archive:
                        members=[m for m in archive.infolist() if not m.is_dir() and m.filename.lower().endswith('.csv')]
                        if sum(m.file_size for m in members)>4_000_000_000:
                            raise CommandError('Uncompressed CSVs exceed the 4 GB safety limit.')
                        for member in members:
                            # Extract only a flat safe name to avoid path traversal.
                            target=Path(tmp)/Path(member.filename).name
                            if target.exists():raise CommandError(f'Duplicate dataset filename: {target.name}')
                            with archive.open(member) as src, target.open('wb') as dst:
                                import shutil
                                shutil.copyfileobj(src,dst)
                        root=Path(tmp)
                except BadZipFile as exc:raise CommandError('Invalid dataset archive.') from exc
            available={f.name.lower():f for f in root.rglob('*.csv')}
            for table,variants in NAMES.items():
                chosen=next((available[n] for n in variants if n in available),None)
                if chosen is None:
                    raise CommandError(f'No CSV file for {table}. Found: {list(available)}')
                self.stdout.write(f'Import {table}: {chosen.name}')
                call_command('import_csv',table,str(chosen),dry_run=dry_run,replace=replace,stdout=self.stdout)
            if dry_run:self.stdout.write('DRY RUN: No data written.')
