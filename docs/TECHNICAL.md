# GnarPuzzle 2.0 - Technical Documentation

## API Documentation

### Authentication Endpoints

#### POST /auth/login
Snabb användarregistrering med bara username.

**Request:**
```json
{
  "username": "string (3-20 chars, alphanumeric)"
}
```

**Response:**
```json
{
  "token": "string",
  "user": {
    "id": "string",
    "username": "string",
    "createdAt": "timestamp"
  }
}
```

### Room Management Endpoints

#### GET /rooms
Lista alla aktiva rum (optimerad för mobil).

**Query Parameters:**
- `limit`: number (default: 20, max: 50)
- `offset`: number (default: 0)

**Response:**
```json
{
  "rooms": [
    {
      "id": "string",
      "code": "string",
      "name": "string",
      "playerCount": "number",
      "maxPlayers": "number",
      "isPrivate": "boolean",
      "createdAt": "timestamp"
    }
  ],
  "total": "number"
}
```

## Database Schema

### Users Table
```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Rooms Table
```sql
CREATE TABLE rooms (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL,
    settings TEXT NOT NULL, -- JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);
```

## Socket.IO Events

### Client -> Server Events

#### join-room
```typescript
socket.emit('join-room', {
  roomCode: string,
  userId: string
});
```

#### select-letter
```typescript
socket.emit('select-letter', {
  letter: string,
  gameId: string,
  playerId: string
});
```

### Server -> Client Events

#### room:joined
```typescript
socket.on('room:joined', (data: {
  room: Room,
  user: User
}) => {
  // Handle user joined room
});
```

## Mobile Performance Guidelines

### Touch Targets
- Minimum 44px × 44px for all interactive elements
- 8px minimum spacing between adjacent touch targets

### Image Optimization
- Use WebP format för alla bilder
- Provide 1x, 2x, 3x variants för olika screen densities
- Lazy load images below fold

### Network Optimization
- Compress all API responses with gzip
- Implement request debouncing för user inputs
- Use WebSocket compression för real-time events

### PWA Requirements
- Service Worker för offline capability
- 512x512 maskable icon
- App shell architecture
- Install prompt handling

## Testing Strategy

### Unit Tests
```bash
# Server tests
cd server && npm test

# Client tests  
cd client && npm test
```

### E2E Tests
```bash
cd client && npm run test:e2e
```

### Performance Testing
- Lighthouse CI för PWA scoring
- Load testing med Artillery.io
- Mobile device testing med BrowserStack