import jwt from 'jsonwebtoken';

function getAccessTokenSecret() {
    return process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;
}

function getRefreshTokenSecret() {
    return process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET;
}

function requireJwtSecret(secret, secretName) {
    if (!secret) {
        throw new Error(`Missing JWT secret. Set ${secretName} or JWT_SECRET.`);
    }

    return secret;
}

function jwtTokens(userRecord) {
    const user = {
        user_id: userRecord.user_id || userRecord.id,
        user_name: userRecord.user_name || userRecord.name,
        user_email: userRecord.user_email || userRecord.email,
    };
    const accessTokenSecret = requireJwtSecret(getAccessTokenSecret(), 'ACCESS_TOKEN_SECRET');
    const refreshTokenSecret = requireJwtSecret(getRefreshTokenSecret(), 'REFRESH_TOKEN_SECRET');
    const accessToken = jwt.sign(user, accessTokenSecret, {expiresIn: '2m'});
    const refreshToken = jwt.sign(user, refreshTokenSecret, {expiresIn: '30m'});
    return ({accessToken, refreshToken});
}

export {getAccessTokenSecret, getRefreshTokenSecret, jwtTokens, requireJwtSecret};