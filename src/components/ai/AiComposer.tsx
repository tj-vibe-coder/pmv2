import React, { useState } from 'react';
import { Box, Button, TextField } from '@mui/material';

interface AiComposerProps {
  onSend: (text: string) => void;
  disabled: boolean;
  liveMode?: boolean;
}

export default function AiComposer({ onSend, disabled, liveMode = false }: AiComposerProps): React.ReactElement {
  const [text, setText] = useState('');

  const submit = () => {
    if (!text.trim() || disabled) return;
    onSend(text);
    setText('');
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
      <TextField
        fullWidth
        multiline
        minRows={2}
        disabled={disabled}
        label={liveMode ? 'Speak or type — Live stays on' : 'Ask IOCT Assist'}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <Button disabled={disabled || !text.trim()} onClick={submit} variant="contained">
        Send
      </Button>
    </Box>
  );
}
