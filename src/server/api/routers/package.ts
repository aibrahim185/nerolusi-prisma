import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { QuestionType, Type, SubtestType, Prisma } from "@prisma/client";

export const packageRouter = createTRPCRouter({
  // Get All Packages
  getAllPackages: protectedProcedure.query(async ({ ctx }) => {
    const packages = await ctx.db.package.findMany({
      orderBy: { id: "desc" },
    });
    return packages ?? null;
  }),

  // Get Packages in Class
  getPackages: protectedProcedure
    .input(
      z.object({
        classId: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await ctx.db.package.findMany({
        where: {
          classId: input.classId,
        },
      });
    }),

  getTryoutPackages: protectedProcedure
    .input(
      z.object({
        classId: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await ctx.db.package.findMany({
        where: {
          classId: input.classId,
          type: "tryout",
        },
      });
    }),

  // Get Single Package with Subtests, Questions, and Answers
  getPackage: protectedProcedure
    .input(z.object({ id: z.number().min(1, "Package ID is required") }))
    .query(async ({ input, ctx }) => {
      const packageData = await ctx.db.package.findUnique({
        where: { id: input.id },
        include: {
          subtests: {
            include: {
              questions: {
                include: {
                  answers: true,
                },
              },
            },
          },
        },
      });
      if (!packageData) {
        throw new Error("Package not found");
      }
      return packageData;
    }),

  // Get Users by Package with Scores
  getUsersByPackage: protectedProcedure
    .input(
      z.object({
        packageId: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const users = await ctx.db.user.findMany({
        where: {
          userAnswers: {
            some: {
              packageId: input.packageId,
            },
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          userAnswers: {
            where: {
              packageId: input.packageId,
            },
            select: {
              question: {
                select: {
                  correctAnswerChoice: true,
                  score: true,
                },
              },
              answerChoice: true,
            },
          },
        },
      });

      // Calculate scores for each user
      return users.map((user) => {
        const score = user.userAnswers.reduce((total, answer) => {
          return (
            total +
            (answer.answerChoice === answer.question.correctAnswerChoice
              ? answer.question.score
              : 0)
          );
        }, 0);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          score,
        };
      });
    }),

  // Create Package
  createPackage: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required"),
        type: z.nativeEnum(Type),
        classId: z.number().positive("Class ID must be a positive number"),
        TOstart: z.string().optional(),
        TOend: z.string().optional(),
        subtests: z.array(
          z.object({
            type: z.nativeEnum(SubtestType),
            duration: z.number().optional(),
            questions: z.array(
              z.object({
                index: z.number().positive("Index must be a positive number"),
                content: z.string().min(1, "Content is required"),
                imageUrl: z.string().optional(),
                type: z.nativeEnum(QuestionType),
                score: z
                  .number()
                  .min(0, "Score must be non-negative")
                  .default(0),
                explanation: z.string().optional(),
                answers: z.array(
                  z.object({
                    index: z
                      .number()
                      .positive("Index must be a positive number"),
                    content: z.string().min(1, "Answer content is required"),
                  }),
                ),
                correctAnswerChoice: z.number().optional(),
              }),
            ),
          }),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const { subtests, ...packageData } = input;

        // Normalize date fields
        const { classId, ...restPackageData } = packageData;
        const normalizedPackageData = {
          ...restPackageData,
          name: packageData.name,
          type: packageData.type,
          TOstart: packageData.TOstart ? new Date(packageData.TOstart) : null,
          TOend: packageData.TOend ? new Date(packageData.TOend) : null,
        };

        // Create Package without packageId in the input
        const createdPackage = await ctx.db.package.create({
          data: {
            ...normalizedPackageData,
            class: {
              connect: { id: classId },
            },
          },
        });

        // Create Subtests, Questions, and Answers using created packageId
        for (const subtest of subtests) {
          await ctx.db.subtest.create({
            data: {
              type: subtest.type,
              duration: subtest.duration,
              packageId: createdPackage.id,
              questions: {
                create: subtest.questions.map((question) => ({
                  index: question.index,
                  content: question.content,
                  imageUrl: question.imageUrl,
                  type: question.type,
                  score: question.score,
                  explanation: question.explanation,
                  correctAnswerChoice: question.correctAnswerChoice,
                  packageId: createdPackage.id,
                  answers: {
                    create: question.answers.map((answer) => ({
                      index: answer.index,
                      content: answer.content,
                    })),
                  },
                })),
              },
            },
            include: {
              questions: {
                include: {
                  answers: true,
                },
              },
            },
          });
        }

        return createdPackage;
      } catch (error) {
        if (error instanceof Error) {
          console.error("Error creating package:", error.message);
          throw new Error("Error creating package: " + error.message);
        }
        throw error;
      }
    }),

  // Update Package
  updatePackage: protectedProcedure
    .input(
      z.object({
        id: z.number().positive("Package ID must be a positive number"),
        name: z.string().min(1, "Name is required").optional(),
        type: z.nativeEnum(Type).optional(),
        classId: z
          .number()
          .positive("Class ID must be a positive number")
          .optional(),
        TOstart: z.string().optional(),
        TOend: z.string().optional(),
        subtests: z
          .array(
            z.object({
              id: z
                .number()
                .positive("Subtest ID must be a positive number")
                .optional(),
              type: z.nativeEnum(SubtestType),
              duration: z.number().optional(),
              questions: z
                .array(
                  z.object({
                    id: z
                      .number()
                      .positive("Question ID must be a positive number")
                      .optional(),
                    index: z
                      .number()
                      .positive("Index must be a positive number"),
                    content: z.string().min(1, "Content is required"),
                    imageUrl: z.string().optional(),
                    type: z.nativeEnum(QuestionType),
                    score: z
                      .number()
                      .min(0, "Score must be non-negative")
                      .default(0),
                    explanation: z.string().optional(),
                    correctAnswerChoice: z.number().optional(),
                    answers: z.array(
                      z.object({
                        id: z
                          .number()
                          .positive("Answer ID must be a positive number")
                          .optional(),
                        index: z
                          .number()
                          .positive("Index must be a positive number"),
                        content: z
                          .string()
                          .min(1, "Answer content is required"),
                      }),
                    ),
                  }),
                )
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const { id, subtests, classId, TOstart, TOend, ...packageData } = input;

        const updatedPackage = await ctx.db.$transaction(async (tx) => {
          const updateData: Prisma.PackageUpdateInput = {
            ...packageData,
            TOstart: TOstart ? new Date(TOstart) : undefined,
            TOend: TOend ? new Date(TOend) : undefined,
            ...(classId && {
              class: {
                connect: { id: classId },
              },
            }),
          };

          const pkg = await tx.package.update({
            where: { id },
            data: updateData,
          });

          if (subtests) {
            const existingSubtests = await tx.subtest.findMany({
              where: { packageId: id },
              select: { id: true },
            });
            const existingSubtestIds = existingSubtests.map((s) => s.id);

            const inputSubtestIds = subtests
              .filter((s) => s.id !== undefined)
              .map((s) => s.id as number);

            const subtestsToDelete = existingSubtestIds.filter(
              (existingId) => !inputSubtestIds.includes(existingId),
            );

            if (subtestsToDelete.length > 0) {
              await tx.subtest.deleteMany({
                where: { id: { in: subtestsToDelete } },
              });
            }

            for (const subtest of subtests) {
              if (subtest.id) {
                const updatedSubtest = await tx.subtest.update({
                  where: { id: subtest.id },
                  data: {
                    type: subtest.type,
                    duration: subtest.duration,
                  },
                });

                if (subtest.questions) {
                  const existingQuestions = await tx.question.findMany({
                    where: { subtestId: subtest.id },
                    select: { id: true },
                  });
                  const existingQuestionIds = existingQuestions.map(
                    (q) => q.id,
                  );

                  const inputQuestionIds = subtest.questions
                    .filter((q) => q.id !== undefined)
                    .map((q) => q.id as number);

                  const questionsToDelete = existingQuestionIds.filter(
                    (existingId) => !inputQuestionIds.includes(existingId),
                  );

                  if (questionsToDelete.length > 0) {
                    await tx.question.deleteMany({
                      where: { id: { in: questionsToDelete } },
                    });
                  }

                  for (const question of subtest.questions) {
                    if (question.id) {
                      const updatedQuestion = await tx.question.update({
                        where: { id: question.id },
                        data: {
                          index: question.index,
                          content: question.content,
                          imageUrl: question.imageUrl,
                          type: question.type,
                          score: question.score,
                          explanation: question.explanation,
                          correctAnswerChoice: question.correctAnswerChoice,
                          packageId: id,
                        },
                      });

                      if (question.answers) {
                        const existingAnswers = await tx.answer.findMany({
                          where: { questionId: question.id },
                          select: { id: true },
                        });
                        const existingAnswerIds = existingAnswers.map(
                          (a) => a.id,
                        );

                        const inputAnswerIds = question.answers
                          .filter((a) => a.id !== undefined)
                          .map((a) => a.id as number);

                        const answersToDelete = existingAnswerIds.filter(
                          (existingId) => !inputAnswerIds.includes(existingId),
                        );

                        if (answersToDelete.length > 0) {
                          await tx.answer.deleteMany({
                            where: { id: { in: answersToDelete } },
                          });
                        }

                        for (const answer of question.answers) {
                          if (answer.id) {
                            await tx.answer.update({
                              where: { id: answer.id },
                              data: {
                                index: answer.index,
                                content: answer.content,
                              },
                            });
                          } else {
                            await tx.answer.create({
                              data: {
                                index: answer.index,
                                content: answer.content,
                                question: {
                                  connect: { id: question.id },
                                },
                              },
                            });
                          }
                        }
                      }
                    } else {
                      const newQuestion = await tx.question.create({
                        data: {
                          index: question.index,
                          content: question.content,
                          imageUrl: question.imageUrl,
                          type: question.type,
                          score: question.score,
                          explanation: question.explanation,
                          correctAnswerChoice: question.correctAnswerChoice,
                          packageId: id,
                          subtest: {
                            connect: { id: subtest.id },
                          },
                        },
                      });

                      if (question.answers) {
                        for (const answer of question.answers) {
                          await tx.answer.create({
                            data: {
                              index: answer.index,
                              content: answer.content,
                              question: {
                                connect: { id: newQuestion.id },
                              },
                            },
                          });
                        }
                      }
                    }
                  }
                }
              } else {
                const newSubtest = await tx.subtest.create({
                  data: {
                    type: subtest.type,
                    duration: subtest.duration,
                    package: {
                      connect: { id },
                    },
                  },
                });

                if (subtest.questions) {
                  for (const question of subtest.questions) {
                    const newQuestion = await tx.question.create({
                      data: {
                        index: question.index,
                        content: question.content,
                        imageUrl: question.imageUrl,
                        type: question.type,
                        score: question.score,
                        explanation: question.explanation,
                        correctAnswerChoice: question.correctAnswerChoice,
                        packageId: id,
                        subtest: {
                          connect: { id: newSubtest.id },
                        },
                      },
                    });

                    if (question.answers) {
                      for (const answer of question.answers) {
                        await tx.answer.create({
                          data: {
                            index: answer.index,
                            content: answer.content,
                            question: {
                              connect: { id: newQuestion.id },
                            },
                          },
                        });
                      }
                    }
                  }
                }
              }
            }
          }

          return pkg;
        });

        return updatedPackage;
      } catch (error) {
        if (error instanceof Error) {
          console.error("Error updating package:", error.message);
          throw new Error("Error updating package: " + error.message);
        }
        throw error;
      }
    }),
});
