import React from 'react';
import { Alert, Box, Chip, Typography } from '@mui/material';
import type { AiMessage } from '../../types/AiAssist';

interface AiMessageListProps {
  messages: AiMessage[];
  onNavigateSource: (route: string) => void;
}

export default function AiMessageList({ messages, onNavigateSource }: AiMessageListProps): React.ReactElement {
  return (
    <Box aria-label="AI Assist messages">
      {messages.map((message) => {
        if (message.role === 'error') {
          return (
            <Alert key={message.id} severity="error" sx={{ mb: 1 }}>
              {message.text}
            </Alert>
          );
        }

        const isUser = message.role === 'user';
        return (
          <Box
            key={message.id}
            sx={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', mb: 1.5 }}
          >
            <Box
              sx={{
                bgcolor: isUser ? 'primary.main' : 'grey.100',
                color: isUser ? 'primary.contrastText' : 'text.primary',
                borderRadius: 2,
                maxWidth: '85%',
                px: 1.5,
                py: 1,
              }}
            >
              <Typography variant="body2">{message.text}</Typography>
            </Box>
            {message.role === 'assistant' && (
              <>
                {message.citations.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                    {message.citations.map((citation) => (
                      <Chip
                        key={citation.id}
                        label={citation.label}
                        size="small"
                        onClick={() => onNavigateSource(citation.route)}
                      />
                    ))}
                  </Box>
                )}
                <Typography color="text.secondary" sx={{ mt: 0.5 }} variant="caption">
                  {message.notice}
                </Typography>
              </>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
