# Private GitHub Repository Data Structure

```txt
/users/index.json
```

예시:

```json
{
  "andy": "user_abc123"
}
```

```txt
/users/{userId}/profile.json
```

예시:

```json
{
  "username": "andy",
  "userId": "user_abc123",
  "passwordHash": "scrypt$...",
  "encryptedPassword": "aes-256-gcm:...",
  "createdAt": "2026-07-01T00:00:00.000Z",
  "updatedAt": "2026-07-01T00:00:00.000Z"
}
```

```txt
/data/{userId}/app-data.json
```

기존 Andy’s Travel Map의 데이터 구조를 그대로 저장합니다.

```txt
/admin/logs.json
```

관리자 기록과 로그인 실패 기록이 최대 500개까지 저장됩니다.
