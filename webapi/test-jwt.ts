import { verify } from 'jsonwebtoken';

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjb25uZWN0b3I6MyIsImluc3RpdHVpY2FvQ29kaWdvIjoyLCJjbGllbnRlQ29kaWdvIjoxLCJ0eXBlIjoiY29ubmVjdG9yIiwiaWF0IjoxNzcyMjIzNTcyLCJleHAiOjE4MDM3NTk1NzJ9.gBoFmDVYusoXf_MXvKKOLt-4BQcVte358VjTfVYhtpU";
const secret = process.env.JWT_SECRET || 'openturn-connector-secret';

try {
    const payload = verify(token, secret);
    console.log('Verification successful!');
    console.log('Payload:', JSON.stringify(payload, null, 2));
} catch (err) {
    console.error('Verification failed:', err.message);
}
