const fs = require("fs");
const path = require("path");

/**
 * Delete a local avatar file if it exists on disk
 * @param {string} avatarUrl - e.g. "/uploads/avatars/avatar-123.jpg" or full URL containing /uploads/avatars/...
 */
const deleteAvatarFile = (avatarUrl) => {
  if (!avatarUrl || typeof avatarUrl !== "string") return;

  // Match /uploads/avatars/<filename> or uploads/avatars/<filename> or full URL
  const match = avatarUrl.match(/(?:^|\/)uploads\/avatars\/([a-zA-Z0-9._-]+)/i);
  let filename = match ? match[1] : null;

  if (!filename && avatarUrl.startsWith("avatar-")) {
    filename = avatarUrl;
  }

  if (filename) {
    const safeFilename = path.basename(filename);
    const filePath = path.join(__dirname, "../../uploads/avatars", safeFilename);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.warn("Failed to delete avatar file:", filePath, err.message);
    }
  }
};

module.exports = {
  deleteAvatarFile,
};
