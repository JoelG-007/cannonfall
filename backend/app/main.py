
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.rooms import router as rooms_router
from app.ws.handlers import router as websocket_router

app = FastAPI(title="Cannonfall API")
*


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://cannonfall.netlify.app",
    ],
    allow_origin_regex=r"https://.*-5173\.app\.github\.dev",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(rooms_router)
app.include_router(websocket_router)


@app.get("/")
async def root():
    return {"message": "Cannonfall server is running"}


@app.get("/health")
async def health():
    return {"status": "ok"}
