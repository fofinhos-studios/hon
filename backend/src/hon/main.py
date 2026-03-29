from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from hon.routers.books import router as books_router

app = FastAPI(title="Hon", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(books_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
