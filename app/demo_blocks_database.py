"""Banco da agenda pública de demonstrações (site + operação; compartilhado com produção)."""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import DATABASE_URL

# No Beta, apontar para erp_db para bloqueios refletirem em climaris.com.br.
DEMO_SCHEDULE_DATABASE_URL = os.getenv("DEMO_SCHEDULE_DATABASE_URL", DATABASE_URL)

demo_blocks_engine = create_engine(DEMO_SCHEDULE_DATABASE_URL, pool_pre_ping=True)
DemoBlocksSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=demo_blocks_engine)


def get_demo_blocks_db() -> Session:
    db = DemoBlocksSessionLocal()
    try:
        yield db
    finally:
        db.close()


get_demo_public_db = get_demo_blocks_db
