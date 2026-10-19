import secrets


async def create_test_interaction(client, target):
    token = secrets.token_hex(4)
    text = f"test_{token}"

    print(
        f"→ Отправляем тестовое сообщение "
        f"@{target.username}..."
    )

    message = await client.send_message(
        target,
        text,
    )

    print(
        f"✓ Сообщение отправлено: {text}"
    )

    await client.delete_messages(
        target,
        [message.id],
        revoke=True,
    )

    print(
        "✓ Сообщение удалено для обеих сторон"
    )