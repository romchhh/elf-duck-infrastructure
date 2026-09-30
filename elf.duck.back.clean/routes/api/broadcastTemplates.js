import { getServerContext } from "../../lib/server/context.js";

export function registerRoutes(app) {
  Object.assign(globalThis, getServerContext());

// ====================== BROADCAST TEMPLATES ======================

app.get("/admin/broadcast/templates", async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_API_TOKEN) {
      return res.status(401).json({ ok: false });
    }

    const templates = await mongoose.connection
      .collection(BROADCAST_TEMPLATES_COLLECTION)
      .find({})
      .sort({ isDefault: -1, createdAt: 1 })
      .toArray();

    res.json({
      ok: true,
      templates,
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      ok: false,
      error: e.message,
    });
  }
});

app.post("/admin/broadcast/templates", async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_API_TOKEN) {
      return res.status(401).json({ ok: false });
    }

    const doc = {
      title: String(req.body.title || "").trim(),
      photoUrl: String(req.body.photoUrl || "").trim(),
      text: String(req.body.text || "").trim(),
      buttonText: String(req.body.buttonText || "").trim(),
      buttonUrl: String(req.body.buttonUrl || "").trim(),
      isDefault: false,
      createdAt: new Date(),
    };

    const result = await mongoose.connection
      .collection(BROADCAST_TEMPLATES_COLLECTION)
      .insertOne(doc);

    res.json({
      ok: true,
      id: result.insertedId,
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      ok: false,
      error: e.message,
    });
  }
});

app.patch("/admin/broadcast/templates/:id", async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_API_TOKEN) {
      return res.status(401).json({ ok: false });
    }

    await mongoose.connection
      .collection(BROADCAST_TEMPLATES_COLLECTION)
      .updateOne(
        {
          _id: new mongoose.Types.ObjectId(req.params.id),
        },
        {
          $set: {
            title: String(req.body.title || "").trim(),
            photoUrl: String(req.body.photoUrl || "").trim(),
            text: String(req.body.text || "").trim(),
            buttonText: String(req.body.buttonText || "").trim(),
            buttonUrl: String(req.body.buttonUrl || "").trim(),
          },
        }
      );

    res.json({ ok: true });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      ok: false,
      error: e.message,
    });
  }
});

app.delete("/admin/broadcast/templates/:id", async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_API_TOKEN) {
      return res.status(401).json({ ok: false });
    }

    await mongoose.connection
      .collection(BROADCAST_TEMPLATES_COLLECTION)
      .deleteOne({
        _id: new mongoose.Types.ObjectId(req.params.id),
      });

    res.json({
      ok: true,
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      ok: false,
      error: e.message,
    });
  }
});

app.post("/admin/broadcast/templates/:id/default", async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_API_TOKEN) {
      return res.status(401).json({ ok: false });
    }

    const collection = mongoose.connection.collection(
      BROADCAST_TEMPLATES_COLLECTION
    );

    await collection.updateMany(
      {},
      {
        $set: {
          isDefault: false,
        },
      }
    );

    await collection.updateOne(
      {
        _id: new mongoose.Types.ObjectId(req.params.id),
      },
      {
        $set: {
          isDefault: true,
        },
      }
    );

    res.json({
      ok: true,
    });
  } catch (e) {
    console.error(e);

    res.status(500).json({
      ok: false,
      error: e.message,
    });
  }
});


}
