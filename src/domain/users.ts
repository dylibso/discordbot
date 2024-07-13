import { getDatabaseConnection, getXtp } from "../db";
import { getLogger } from "../logger";

const logger = getLogger()

export interface User {
  id: string,
  username: string,
  data: Record<string, any>,
  created_at: Date,
  updated_at: Date,
  deleted_at?: Date | null,
}

export interface XtpData {
  inviteLink?: string
}

export function getXtpData(user: User) {
  return user.data.xtp as XtpData
}

function patchXtpData(user: User, data: Partial<XtpData>) {
  user.data.xtp = { ...getXtpData(user), ...data }
}

export interface OAuthGitHubCredentials {
  oauth: { access_token: string, scope: string, token_type: string },
  user: { login: string, avatar_url: string, name: string, [k: string]: any },
}

export interface DiscordCredentials {
  id: string, username: string, discriminator: string, avatar?: string | null, hexAccentColor?: number, [k: string]: any
}

export interface EmailPassword {
  email: string,
  password: string
}

export interface RegisterUser {
  username: string,
  github?: OAuthGitHubCredentials
  emailPassword?: EmailPassword
  discord?: DiscordCredentials
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

export async function findUserByUsername(username: string): Promise<User | null> {
  const db = await getDatabaseConnection()

  const { rows: [user = null] } = await db.query(`
    SELECT
      "users".*
    FROM "users"
    WHERE
      "users"."username" = $1
    LIMIT 1
  `, [username])

  return user as User | null
}

export async function updateUser(db: any, user: User) {
  const { rows: [updatedUser] } = await db.query(`
    UPDATE "users"
    SET
      username = $2,
      data = $3
    WHERE
      id = $1
    RETURNING *;
  `, [user.id, user.username, user.data])

  return updatedUser
}

export async function registerUser(registration: RegisterUser) {
  const db = await getDatabaseConnection()
  const xtp = await getXtp()

  try {
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
          guestKey: user.id,
          deliveryMethod: 'email'
        }).catch(err => {
          logger.error(err)
        })
      } else if (registration.discord) {
        logger.info(`user signup via discord; username="${registration.username}"`)
        await db.query(`
          INSERT INTO "credentials" (
            user_id,
            "type",
            data
          ) VALUES (
            $1,
            'discord',
            $2::jsonb
          );
        `, [user.id, JSON.stringify(registration.discord)])

        const response = await xtp.inviteGuest({ guestKey: user.id, deliveryMethod: 'link' });
        patchXtpData(user, { inviteLink: response.link.link })

        await updateUser(db, user)
      }

      if (registration.emailPassword) {
        // TODO
      }


      return [true, user]
    })
  } catch (e: any) {
    if (e.code === '23505' && e.constraint === 'users_username_idx') {
      const user = await findUserByUsername(registration.username)
      if (user) {
        return [false, user]
      }
    }

    throw e
  }
}
