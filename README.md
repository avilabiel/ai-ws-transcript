# Live Technical Speech Analyzer

A real-time speech transcription and technical correctness analyzer that uses OpenAI's Whisper for transcription and GPT-4 for technical analysis.

## Future Challenges

- 🎯 Process audio/transcripts in bigger chunks for better context
- 💰 Optimize costs by potentially using offline models
- ⚡ Improve efficiency of the model for better text processing
- 🔄 Consider alternative audio capture methods beyond browser APIs

## Features

- 🎤 Real-time audio transcription
- 🔍 Technical correctness analysis
- 🎯 Visual indicator for technical accuracy
- 📝 Continuous transcription with explanations
- 🎨 Modern, responsive UI

## Prerequisites

- Node.js (v16 or higher)
- OpenAI API key
- A modern web browser with microphone access

## Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd ai-ws-transcript
```

2. Install dependencies:

```bash
npm install
# or
yarn install
```

3. Create a `.env` file in the root directory with your OpenAI API key:

```
OPENAI_API_KEY=your_api_key_here
```

## Usage

1. Start the server:

```bash
npm start
# or
yarn start
```

2. Open your browser and navigate to:

```
http://localhost:3000
```

3. Select your microphone from the dropdown menu

4. Click "Start Transcription" to begin

5. Speak into your microphone - the system will:

   - Transcribe your speech in real-time
   - Analyze the technical correctness
   - Display results with explanations
   - Update every 3 seconds

6. Click "Stop" when you're done

## Technical Details

- Uses WebSocket for real-time communication
- Records audio at 16kHz sample rate
- Processes audio in 3-second chunks
- Uses OpenAI's Whisper model for transcription
- Uses GPT-4 for technical analysis
- Supports all modern browsers

## UI Components

- 🎙️ Microphone selection dropdown
- 🔄 Refresh devices button
- 🟢 Start button
- 🔴 Stop button
- 📝 Transcription display
- 🎯 Technical correctness indicator
- 💬 Status messages

## Technical Analysis

The system analyzes your speech for technical correctness in:

- Programming concepts
- Computer science principles
- Technical terminology
- Logical consistency
- Factual accuracy

## Troubleshooting

1. If you don't see your microphone:

   - Click "Refresh Microphone List"
   - Make sure your microphone is properly connected
   - Check browser permissions

2. If transcription isn't working:

   - Check your OpenAI API key
   - Ensure your microphone is working
   - Try speaking more clearly
   - Check browser console for errors

3. If the technical analysis is slow:
   - This is normal, as it uses GPT-4
   - Analysis happens every 3 seconds
   - Make sure you have a stable internet connection

## License

MIT

## Contributing

Feel free to submit issues and enhancement requests!
