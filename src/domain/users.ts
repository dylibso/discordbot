import { getDatabaseConnection, getXtp } from "../db";

export interface User {
  id: string,
  username: string,
  data: Record<string, any>,
  created_at: Date,
  updated_at: Date,
  deleted_at?: Date | null
}

export interface OAuthGitHubCredentials {
  oauth: { access_token: string, scope: string, token_type: string },
  user: { login: string, avatar_url: string, name: string, [k: string]: any },
}

export interface EmailPassword {
  email: string,
  password: string
}

export interface RegisterUser {
  username: string,
  github?: OAuthGitHubCredentials
  emailPassword?: EmailPassword
}

export async function findUserByGithubLogin(githubLogin: string) {
  const db = await getDatabaseConnection()

  const { rows: [user = null] } = await db.query(`
    SELECT
      "users".*
    FROM "users"
    LEFT JOIN "credentials" on "credentials"."user_id" = "users"."id"
    WHERE
      "credentials"."type" = 'oauth-github' AND
      "credentials"."deleted_at" is null AND
      "users"."deleted_at" is null AND
      "credentials"."data" ->> 'login' = $1
    LIMIT 1
  `, [githubLogin])

  return user
}

export async function registerUser(registration: RegisterUser): Promise<User> {
  const db = await getDatabaseConnection()
  const xtp = await getXtp()

  return await db.transaction(async (db: any) => {
    const result = await db.query(`
      INSERT INTO "users" (
        username
      ) VALUES (
        $1
      ) RETURNING *;
    `, [registration.username])

    const { rows: [user] } = result

    if (registration.github) {
      await db.query(`
        INSERT INTO "credentials" (
          user_id,
          "type",
          data
        ) VALUES (
          $1,
          'oauth-github',
          $2::jsonb
        );
      `, [user.id, JSON.stringify(registration.github.user)])

      await xtp.inviteGuest({
        name: registration.github.user.name,
        email: registration.github.user.email,
        guestKey: user.id
      }).catch(err => {
        console.error(err)
        throw err
      })
    }

    if (registration.emailPassword) {
      // TODO
    }


    return user
  })
}
