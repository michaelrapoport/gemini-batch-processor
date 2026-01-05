
```text
   ____                _       _   
  / ___| ___ _ __ ___ (_)_ __ (_)  
 | |  _ / _ \ '_ ` _ \| | '_ \| |  
 | |_| |  __/ | | | | | | | | | |  
  \____|\___|_| |_| |_|_|_| |_|_|  
      B A T C H   P R O C E S S O R
```

# Gemini Batch Content Processor

A powerful, high-concurrency web dashboard designed to batch process **HTML, TXT, and Markdown** files using Google's **Gemini 3 Flash** model. This tool allows for bulk analysis, summarization, or transformation of content with customizable system prompts and advanced tool integration.

---

## 🌟 Features

*   **Batch Processing**: Upload and process multiple files (HTML, TXT, MD) simultaneously.
*   **Gemini 3 Flash**: Powered by the latest `gemini-3-flash-preview` model for high-speed, low-latency responses.
*   **Concurrency Control**: Adjust parallel processing threads (1-5) to manage rate limits and speed.
*   **Customizable Prompts**: Define specific system instructions for the model (e.g., "Extract SEO tags", "Summarize content").
*   **Advanced Tools**:
    *   **Google Search Grounding**: Augment responses with real-time web data.
    *   **Code Execution**: Allow the model to write and execute Python code for complex logic.
*   **Temperature Control**: Fine-tune the creativity vs. precision of the model.
*   **Export Options**: Download individual results as HTML or the entire batch as a structured JSON file.
*   **Real-time Status**: Visual indicators for Queued, Processing, Completed, and Failed states.

## 🚀 Getting Started

### Prerequisites

*   Node.js (v18 or higher)
*   A Google Cloud Project with the Gemini API enabled
*   A valid `API_KEY`

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/michael-rapoport/gemini-batch-processor.git
    cd gemini-batch-processor
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Set up your environment variables. Create a `.env` file in the root directory:
    ```env
    API_KEY=your_google_genai_api_key_here
    ```

4.  Start the development server:
    ```bash
    npm start
    ```

## 🛠️ Usage Guide

1.  **Configuration**:
    *   Enter your **System Prompt** in the text area.
    *   Adjust **Temperature** (0.0 for strict tasks, 1.0+ for creative tasks).
    *   Set **Concurrency** based on your API tier limits (default is 2).
    *   Select a **Tool** if necessary (Google Search or Code Execution). Note: Tools are mutually exclusive.

2.  **Upload**:
    *   Click the upload area or drag and drop files (**HTML, TXT, MD**).

3.  **Process**:
    *   Click **Start Batch** to begin. The app will manage the queue based on your concurrency settings.
    *   You can **Pause** the operation at any time.

4.  **Results**:
    *   View results in the library on the right.
    *   Click the **Eye** icon to preview the response.
    *   Click the **Download** icon to save individual files (saved as `.html` containing the processed output).
    *   Use **Export JSON** to save the entire session.

## 👤 Credits

**Architected and Designed by Michael Rapoport.**

Built with:
*   [React 19](https://react.dev/)
*   [Tailwind CSS](https://tailwindcss.com/)
*   [Google GenAI SDK](https://www.npmjs.com/package/@google/genai)
*   [Lucide Icons](https://lucide.dev/)
