"""Verify a logical dump in a newly created temporary database; never restores over the app."""
from pathlib import Path
import os
import sys
import subprocess
import uuid
import json

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings.development')
import django
django.setup()
from django.conf import settings
import psycopg
from psycopg import sql

db=settings.DATABASES['default']
params=dict(host=db['HOST'],port=db['PORT'],user=db['USER'],password=db['PASSWORD'])
tools=ROOT/'.local-tools/pg-clients/pgsql/bin'
env={**os.environ,'PGPASSWORD':db['PASSWORD']}
target='tanpoosh_restore_check_'+uuid.uuid4().hex[:12]
backups=ROOT/'backend/backups'
backups.mkdir(parents=True,exist_ok=True)
dump=backups/(target+'.dump')
args=['-h',str(db['HOST']),'-p',str(db['PORT']),'-U',db['USER']]
tables=['django_migrations','catalog_product','catalog_variant','inventory_stocklevel','orders_order','orders_orderitem']
def counts(name):
    with psycopg.connect(dbname=name,**params) as c:
        return {t:c.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(t))).fetchone()[0] for t in tables}
before=counts(db['NAME'])
subprocess.run([str(tools/'pg_dump.exe'),*args,'-d',db['NAME'],'-Fc','--no-owner','--no-acl','-f',str(dump)],env=env,check=True)
with psycopg.connect(dbname='postgres',autocommit=True,**params) as admin:
    admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(target)))
    try:
        subprocess.run([str(tools/'pg_restore.exe'),*args,'-d',target,'--no-owner','--no-acl','--exit-on-error',str(dump)],env=env,check=True)
        after=counts(target)
        if before!=after: raise RuntimeError('Restored table counts differ; check for concurrent catalog/order writes')
        result={'status':'passed','dump_bytes':dump.stat().st_size,'source_counts':before,'restored_counts':after,'app_database_unchanged':True}
        (ROOT/'logs/backup-restore.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        print(json.dumps(result))
    finally:
        # Only the unique scratch database created above is dropped.
        admin.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(target)))
