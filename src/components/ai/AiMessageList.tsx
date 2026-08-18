import React from 'react';
import { Alert, Box, Chip, Typography } from '@mui/material';
import type { AiMessage } from '../../types/AiAssist';
import AiSourceList from './AiSourceList';
import { renderAiMarkdown } from './aiMarkdown';

interface AiMessageListProps {
  messages: AiMessage[];
  onNavigateSource: (route: string) => void;
  onFollowUp: (question: string) => void;
}

export default function AiMessageList({ messages, onNavigateSource, onFollowUp }: AiMessageListProps): React.ReactElement {
  const lastIndex = messages.length - 1;
  return (
    <Box aria-label="AI Assist messages">
      {messages.map((message, index) => {
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
              {isUser ? (
                <Typography variant="body2">{message.text}</Typography>
              ) : (
                renderAiMarkdown(message.text)
              )}
            </Box>
            {message.role === 'assistant' && (
              <>
                <AiSourceList citations={message.citations} onNavigateSource={onNavigateSource} />
                <Typography color="text.secondary" sx={{ mt: 0.5 }} variant="caption">
                  {message.notice}
                </Typography>
                {index === lastIndex && message.followUps.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                    {message.followUps.map((question) => (
                      <Chip
                        key={question}
                        label={question}
                        size="small"
                        variant="outlined"
                        onClick={() => onFollowUp(question)}
                      />
                    ))}
                  </Box>
                )}
              </>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
