import asyncio
import sys

from telethon.errors import (
    PhoneCodeExpiredError,
    PhoneCodeInvalidError,
    SessionPasswordNeededError,
)

from src.telegram_client import create_client


async def main():
    if len(sys.argv) != 2:
        print("Использование:")
        print("python3 auth_sender.py <sender_name>")
        return

    sender_name = sys.argv[1].strip()

    print("=" * 60)
    print(f"АВТОРИЗАЦИЯ: {sender_name}")
    print("=" * 60)

    client = create_client(sender_name)

    try:
        print("Подключаемся к Telegram...")
        await client.connect()

        if await client.is_user_authorized():
            print("Сессия уже авторизована.")

        else:
            phone = input(
                "Введите номер телефона в международном формате: "
            ).strip()

            print()
            print("Запрашиваем НОВЫЙ код у Telegram...")

            sent_code = await client.send_code_request(
                phone
            )

            print("✓ Telegram принял запрос кода")
            print(
                "Тип доставки:",
                type(sent_code.type).__name__,
            )

            print(
                "Следующий доступный тип:",
                type(sent_code.next_type).__name__
                if sent_code.next_type is not None
                else "нет",
            )

            print(
                "Timeout:",
                sent_code.timeout,
            )

            print()
            print(
                "Используй ТОЛЬКО код из самого "
                "свежего сообщения Telegram."
            )

            code = input(
                "Введите новый код: "
            ).strip()

            try:
                await client.sign_in(
                    phone=phone,
                    code=code,
                    phone_code_hash=sent_code.phone_code_hash,
                )

            except PhoneCodeInvalidError:
                print()
                print(
                    "✗ Код неверный именно для "
                    "текущего запроса."
                )
                print(
                    "Старый код повторно не используй."
                )
                return

            except PhoneCodeExpiredError:
                print()
                print("✗ Код уже истёк.")
                print(
                    "Запусти auth_sender.py заново "
                    "и используй новый код."
                )
                return

            except SessionPasswordNeededError:
                print()
                print("Telegram запросил пароль 2FA.")

                password = input("Введите пароль 2FA: ")

                await client.sign_in(
                    password=password
                )

        me = await client.get_me()

        print()
        print("=" * 60)
        print("АВТОРИЗАЦИЯ УСПЕШНА")
        print(f"Session: {sender_name}")
        print(f"ID: {me.id}")
        print(f"Имя: {me.first_name}")

        if me.username:
            print(f"Username: @{me.username}")
        else:
            print("Username: отсутствует")

        print("=" * 60)

    finally:
        if client.is_connected():
            await client.disconnect()

        print("Telegram отключён.")


if __name__ == "__main__":
    asyncio.run(main())