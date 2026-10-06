import { sendEmailVerificationOtpStrictProcedure } from "@crikket/auth/procedures/email-otp"
import {
  addExistingOrganizationMemberProcedure,
  getAuthEmailDeliveryStatusProcedure,
  getOrganizationInvitationProcedure,
} from "@crikket/auth/procedures/organization-invitation"

export const authRouter = {
  addExistingOrganizationMember: addExistingOrganizationMemberProcedure,
  getAuthEmailDeliveryStatus: getAuthEmailDeliveryStatusProcedure,
  getOrganizationInvitation: getOrganizationInvitationProcedure,
  sendEmailVerificationOtpStrict: sendEmailVerificationOtpStrictProcedure,
}
