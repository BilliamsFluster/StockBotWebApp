"""
Service factory for creating and configuring Jarvis components.
This centralizes the initialization logic, making it easier to manage
and test the application's services.
"""
from .jarvis_service import JarvisService
from .ollama_agent import OllamaAgent
from .memory_manager import MemoryManager

def create_jarvis_service() -> JarvisService:
    """
    Creates and configures the main JarvisService and its dependencies.
    """
    print("🔧 Initializing Jarvis services...")

    # 1. Initialize Memory Manager
    memory_manager = MemoryManager(storage_dir="data/memory")

    # 2. Initialize the LLM Agent
    # Using llama3:8b as planned. This is now the single source of truth.
    llm_agent = OllamaAgent("llama3:8b", memory_manager)

    # 3. Initialize the main Jarvis Service with the agent
    jarvis_service = JarvisService(llm_agent=llm_agent)
    
    print("✅ Jarvis services initialized successfully.")
    return jarvis_service

# Create a single, shared instance of the JarvisService for the application
jarvis_service_instance = create_jarvis_service()