import asyncio
from pprint import pprint

from telethon import functions

from src.telegram_client import create_client


SOURCE_USERNAME = "carterauto"
STORY_ID = 1688


async def main():
    client = create_client()
    await client.start()

    print("=" * 60)
    print(f"Получаем @{SOURCE_USERNAME} / Story #{STORY_ID}")
    print("=" * 60)

    peer = await client.get_input_entity(SOURCE_USERNAME)

    result = await client(
        functions.stories.GetStoriesByIDRequest(
            peer=peer,
            id=[STORY_ID],
        )
    )

    if not result.stories:
        print("Story не найдена.")
        await client.disconnect()
        return

    story = result.stories[0]

    print("\n" + "=" * 60)
    print("STORY")
    print("=" * 60)

    print(f"TYPE: {type(story).__name__}")
    print(f"ID: {getattr(story, 'id', None)}")
    print(f"DATE: {getattr(story, 'date', None)}")
    print(f"CAPTION: {getattr(story, 'caption', None)!r}")

    print("\n--- ENTITIES ---")
    pprint(getattr(story, "entities", None))

    print("\n--- MEDIA AREAS ---")

    media_areas = getattr(story, "media_areas", None)

    if not media_areas:
        print("Нет media areas")
    else:
        for index, area in enumerate(media_areas, start=1):
            print(f"\nMEDIA AREA #{index}")
            print(f"TYPE: {type(area).__name__}")

            print("\nFULL DATA:")
            if hasattr(area, "to_dict"):
                pprint(area.to_dict())
            else:
                pprint(area)

            print("\nURL:")
            pprint(getattr(area, "url", None))

            print("\nCOORDINATES:")
            coordinates = getattr(area, "coordinates", None)

            if hasattr(coordinates, "to_dict"):
                pprint(coordinates.to_dict())
            else:
                pprint(coordinates)

    print("\n--- MEDIA ---")
    media = getattr(story, "media", None)

    if hasattr(media, "to_dict"):
        pprint(media.to_dict())
    else:
        pprint(media)

    print("\n--- FORWARD / SOURCE ---")
    fwd_from = getattr(story, "fwd_from", None)

    if hasattr(fwd_from, "to_dict"):
        pprint(fwd_from.to_dict())
    else:
        pprint(fwd_from)

    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())