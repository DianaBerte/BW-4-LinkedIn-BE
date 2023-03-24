// DONE – GET https://yourapi.cyclic.com/api/users/ Retrieves list of users

// DONE – GET https://yourapi.cyclic.com/api/users/{userId}  Retrieves the user with userId = {userId}

// DONE – POST https://yourapi.cyclic.com/api/users/  Registers a new user with all his details

// DONE – PUT https://yourapi.cyclic.com/api/users/{userId}  Update current user profile details

// DONE – POST https://yourapi.cyclic.com/api/users/{userId}/image  Replace user profile image

// – GET https://yourapi.cyclic.com/api/profile/users/{userId}/CV  Generates and download a PDF with the CV of the user (details, image, experiences)

import express from "express";
import createHttpError from "http-errors";
import UsersModel from "./model.js";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import { getPDFReadableStream } from "../../lib/pdf-tools.js";
import { pipeline } from "stream";
import fs from "fs-extra";

const usersRouter = express.Router();

usersRouter.post("/", async (req, res, next) => {
  try {
    const newUser = new UsersModel(req.body);
    const { _id } = await newUser.save();
    res.status(201).send({ _id });
  } catch (error) {
    next(error);
  }
});

usersRouter.get("/", async (req, res, next) => {
  try {
    const users = await UsersModel.find();
    res.send(users);
  } catch (error) {
    next(error);
  }
});

usersRouter.get("/:userId", async (req, res, next) => {
  try {
    const user = await UsersModel.findById(req.params.userId);
    if (user) {
      res.send(user);
    } else {
      next(
        createHttpError(404, `User with id ${req.params.userId} not found!`)
      );
    }
  } catch (error) {
    next(error);
  }
});

usersRouter.put("/:userId", async (req, res, next) => {
  try {
    const updatedUser = await UsersModel.findByIdAndUpdate(
      req.params.userId,
      req.body,
      { new: true, runValidators: true }
    );
    if (updatedUser) {
      res.send(updatedUser);
    } else {
      next(
        createHttpError(404, `User with id ${req.params.userId} not found!`)
      );
    }
  } catch (error) {
    next(error);
  }
});

usersRouter.delete("/:userId", async (req, res, next) => {
  try {
    const deletedUser = await UsersModel.findByIdAndDelete(req.params.userId);
    if (deletedUser) {
      res.status(204).send();
    } else {
      next(
        createHttpError(404, `User with id ${req.params.userId} not found!`)
      );
    }
  } catch (error) {
    next(error);
  }
});

// – POST https://yourapi.cyclic.com/api/users/{userId}/image  Replace user profile image

const cloudinaryUploader = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: { folder: "users/image" },
  }),
}).single("image");

usersRouter.post(
  "/:userId/image",
  cloudinaryUploader,
  async (req, res, next) => {
    try {
      if (req.file) {
        console.log("FILE:", req.file);
        const user = await UsersModel.findById(req.params.userId);
        if (user) {
          user.image = req.file.path;
          await user.save();
          res.send("Image successfully uploaded!");
        } else {
          next(
            createHttpError(404, `User with id ${req.params.userId} not found!`)
          );
        }
      } else {
        next(createHttpError(400, "Error in uploading the image"));
      }
    } catch (error) {
      next(error);
    }
  }
);

// – GET https://yourapi.cyclic.com/api/profile/users/{userId}/CV  Generates and download a PDF with the CV of the user (details, image, experiences)

usersRouter.get("/:userId/CV", async (req, res, next) => {
  try {
    res.setHeader("Content-Disposition", "attachment; filename=CV.pdf");
    const users = await UsersModel.findById(req.params.userId);
    const source = await getPDFReadableStream(users);
    const destination = res;

    pipeline(source, destination, (err) => {
      if (err) console.log(err);
    });
  } catch (error) {
    next(error);
  }
});
//sending a new request
usersRouter.put(
  "/:senderId/sendRequest/:receiverId",
  async (req, res, next) => {
    try {
      const sender = await UsersModel.findById(req.params.senderId);
      const receiver = await UsersModel.findById(req.params.receiverId);

      if (!sender) {
        return next(
          createHttpError(404, `user with id ${req.params.senderId} not found!`)
        );
      }
      if (!receiver) {
        return next(
          createHttpError(
            404,
            `user with id ${req.params.receiverId} not found!`
          )
        );
      }

      if (sender.friends.includes(receiver._id)) {
        res.send("Cannot send the request, you are already friends");
      } else {
        if (receiver.pending.includes(sender._id)) {
          res.send("You've already sent the friend request and its pending");
        } else {
          const updatedSender = await UsersModel.findByIdAndUpdate(
            { _id: req.params.senderId },
            { $push: { send: receiver } },
            { new: true, runValidators: true, upsert: true }
          );
          const updatedReceiver = await UsersModel.findByIdAndUpdate(
            { _id: req.params.receiverId },
            { $push: { pending: sender } },
            { new: true, runValidators: true, upsert: true }
          );
          res.send({
            senderSendArray: updatedSender.send,
            receiverPendingArray: updatedReceiver.pending,
            sendersFriendsArray: updatedSender.friends,
            receiversFriendsArray: updatedReceiver.friends,
          });
        }
      }
    } catch (error) {
      next(error);
    }
  }
);

//accept request

usersRouter.put(
  "/:senderId/acceptRequest/:receiverId",
  async (req, res, next) => {
    try {
      const sen = await UsersModel.findById(req.params.senderId);
      const rec = await UsersModel.findById(req.params.receiverId);
      if (sen) {
        if (rec.pending.includes(sen._id)) {
          const receiver = await UsersModel.findByIdAndUpdate(
            req.params.receiverId,
            {
              $push: { friends: req.params.senderId },
              $pull: { pending: req.params.senderId },
            },

            { new: true, runValidators: true }
          );
          const sender = await UsersModel.findByIdAndUpdate(
            req.params.senderId,
            {
              $push: { friends: req.params.receiverId },
              $pull: { send: req.params.receiverId },
            },

            { new: true, runValidators: true }
          );
          res.send({
            accepted: "accepted",
            senderSendArray: sender.send,
            receiverPendingArray: receiver.pending,
            sendersFriendsArray: sender.friends,
            receiversFriendsArray: receiver.friends,
          });
        } else {
          res.send("Please send a request");
        }
      } else {
        res.send("sender not found");
      }
    } catch (err) {
      next(err);
    }
  }
);

//decline request
usersRouter.put(
  "/:senderId/declineRequest/:receiverId",
  async (req, res, next) => {
    try {
      const sen = await UsersModel.findById(req.params.senderId);
      const rec = await UsersModel.findById(req.params.receiverId);
      if (sen) {
        if (rec.pending.includes(sen._id)) {
          const receiver = await UsersModel.findByIdAndUpdate(
            req.params.receiverId,
            {
              $pull: { pending: req.params.senderId },
            },

            { new: true, runValidators: true }
          );
          const sender = await UsersModel.findByIdAndUpdate(
            req.params.senderId,
            {
              $pull: { send: req.params.receiverId },
            },

            { new: true, runValidators: true }
          );
          res.send({
            declined: "declined",
            senderSendArray: sender.send,
            receiverPendingArray: receiver.pending,
            sendersFriendsArray: sender.friends,
            receiversFriendsArray: receiver.friends,
          });
        } else {
          res.send("Please send a request");
        }
      } else {
        res.send("sender not found");
      }
    } catch (err) {
      next(err);
    }
  }
);

usersRouter.put(
  "/:senderId/removeFriend/:receiverId",
  async (req, res, next) => {
    try {
      const sen = await UsersModel.findById(req.params.senderId);
      const rec = await UsersModel.findById(req.params.receiverId);
      if (sen) {
        if (rec.friends.includes(sen._id)) {
          const receiver = await UsersModel.findByIdAndUpdate(
            req.params.receiverId,
            {
              $pull: { friends: req.params.senderId },
            },

            { new: true, runValidators: true }
          );
          const sender = await UsersModel.findByIdAndUpdate(
            req.params.senderId,
            {
              $pull: { friends: req.params.receiverId },
            },

            { new: true, runValidators: true }
          );
          res.send({
            removedFromFriends: "removed from friends",
            senderSendArray: sender.send,
            receiverPendingArray: receiver.pending,
            sendersFriendsArray: sender.friends,
            receiversFriendsArray: receiver.friends,
          });
        } else {
          res.send("Please send a request");
        }
      } else {
        res.send("sender not found");
      }
    } catch (err) {
      next(err);
    }
  }
);
export default usersRouter;
